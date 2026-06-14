// utils/ledger.js — 账本系统 v1（参考养花小程序 family.js 架构）
//
// 账本 = 一个独立的记账空间
// - 个人账本：本地 storage，无需云端
// - 共享账本：云端数据，多人读写（家庭、情侣、团队等）
//
// 设计模式：
//   ledger.isInLedger() → true 时所有数据走云端缓存
//   ledger.isInLedger() → false 时走本地 storage
//   乐观写：操作先本地生效，后台推云端，失败回滚

const util = require('./util')
const storage = require('./storage')

const LedgerManager = {
  KEYS: {
    CURRENT_LEDGER: 'currentLedger',
    LEDGER_LIST: 'ledgerList',
    LEDGER_CACHE: 'ledgerCache_',
    LEDGER_INVITE: 'ledgerInvite'
  },

  // ========== 当前账本 ==========

  /**
   * 获取当前账本信息
   * @returns {{ id, name, type, role, inLedger }}
   */
  getCurrentLedger() {
    return storage.cachedGet(this.KEYS.CURRENT_LEDGER) || { inLedger: false }
  },

  /**
   * 是否在共享账本中
   */
  isInLedger() {
    return this.getCurrentLedger().inLedger === true
  },

  /**
   * 获取账本的云端 ID
   * 共享账本的 cloudId 才是云函数需要的真实 ID
   */
  getCloudId(ledgerId) {
    const list = this.getLedgerList()
    const item = list.find(l => l.id === ledgerId)
    return item ? (item.cloudId || item.id) : ledgerId
  },

  /**
   * 切换账本
   */
  switchLedger(ledgerId) {
    const list = this.getLedgerList()
    const item = list.find(l => l.id === ledgerId)
    if (item) {
      const info = {
        id: item.id,
        cloudId: item.cloudId || null,
        name: item.name,
        type: item.type,   // 'personal' | 'shared'
        role: item.role,    // 'owner' | 'member'
        icon: item.icon,
        inLedger: item.type === 'shared'
      }
      storage.cachedSet(this.KEYS.CURRENT_LEDGER, info)
      return { success: true, info }
    }
    // 切到个人模式
    storage.cachedSet(this.KEYS.CURRENT_LEDGER, { inLedger: false, type: 'personal' })
    return { success: true, info: { inLedger: false, type: 'personal' } }
  },

  // ========== 账本列表 ==========

  getLedgerList() {
    return storage.cachedGet(this.KEYS.LEDGER_LIST) || []
  },

  saveLedgerList(list) {
    storage.cachedSet(this.KEYS.LEDGER_LIST, list)
  },

  /**
   * 初始化默认个人账本
   */
  /**
   * 确保默认账本存在，返回账本列表
   */
  ensureAndGetList() {
    const list = this.getLedgerList()
    if (list.length === 0) {
      const personal = {
        id: 'personal_' + Date.now(),
        name: '我的账本',
        icon: '📒',
        type: 'personal',
        role: 'owner',
        createdAt: Date.now(),
        memberCount: 1
      }
      this.saveLedgerList([personal])
      return [personal]
    }
    return list
  },

  /**
   * @deprecated 用 ensureAndGetList() 替代
   */
  initDefaultLedger() {
    return this.ensureAndGetList()
  },

  /**
   * 创建新账本
   * @param {string} name 账本名称
   * @param {string} type 'personal' | 'shared'
   */
  createLedger(name, type = 'personal') {
    const list = this.getLedgerList()
    const ledger = {
      id: (type === 'shared' ? 'shared_' : 'personal_') + Date.now(),
      name,
      icon: this._getLedgerIcon(type),
      type,
      role: 'owner',
      inviteCode: type === 'shared' ? this._genInviteCode() : '',
      createdAt: Date.now(),
      memberCount: 1
    }
    list.unshift(ledger)
    this.saveLedgerList(list)

    // 创建云端账本（共享模式）
    if (type === 'shared' && wx.cloud) {
      this._createCloudLedger(ledger)
    }

    return ledger
  },

  /**
   * 创建云端账本（异步，失败不阻塞本地）
   */
  _createCloudLedger(ledger) {
    if (!wx.cloud) return
    wx.cloud.callFunction({
      name: 'billData',
      data: {
        action: 'createLedger',
        data: {
          name: ledger.name,
          icon: ledger.icon
        }
      }
    }).then(res => {
      if (res.result && res.result.success) {
        // 用云端返回的真实邀请码更新本地
        const list = this.getLedgerList()
        const target = list.find(l => l.id === ledger.id)
        if (target) {
          target.inviteCode = res.result.inviteCode
          target.cloudId = res.result._id  // 记住云端 ID
          this.saveLedgerList(list)
        }
      } else {
        console.warn('创建云端账本失败:', res.result)
      }
    }).catch(err => {
      console.error('创建云端账本异常:', err)
    })
  },

  /**
   * 删除账本
   */
  deleteLedger(ledgerId) {
    let list = this.getLedgerList()
    const target = list.find(l => l.id === ledgerId)

    // 不能删除唯一的账本
    if (list.length <= 1) return { success: false, reason: '至少保留一个账本' }
    // 只有 owner 能删
    if (target && target.role !== 'owner') return { success: false, reason: '只有创建者能删除' }

    list = list.filter(l => l.id !== ledgerId)
    this.saveLedgerList(list)

    // 如果删的是当前账本，切换到第一个
    const current = this.getCurrentLedger()
    if (current.id === ledgerId) {
      this.switchLedger(list[0].id)
    }

    // 清缓存
    this._clearLedgerCache(ledgerId)

    // 共享账本：云端清理（用 cloudId）
    if (target && target.type === 'shared' && wx.cloud) {
      const cloudId = target.cloudId || target.id
      try {
        wx.cloud.callFunction({
          name: 'billData',
          data: { action: 'leaveLedger', ledgerId: cloudId }
        })
      } catch (e) {}
    }

    return { success: true }
  },

  /**
   * 重命名账本
   */
  renameLedger(ledgerId, newName) {
    if (!newName || newName.trim().length > 10) {
      return { success: false, reason: '名称1-10个字' }
    }
    const list = this.getLedgerList()
    const ledger = list.find(l => l.id === ledgerId)
    if (ledger) {
      ledger.name = newName.trim()
      this.saveLedgerList(list)
      // 同步当前
      if (this.getCurrentLedger().id === ledgerId) {
        const info = this.getCurrentLedger()
        info.name = newName.trim()
        storage.cachedSet(this.KEYS.CURRENT_LEDGER, info)
      }
    }
    return { success: true }
  },

  // ========== 邀请系统 ==========

  /**
   * 获取邀请码
   */
  getInviteCode(ledgerId) {
    const list = this.getLedgerList()
    const ledger = list.find(l => l.id === ledgerId)
    return ledger ? ledger.inviteCode : ''
  },

  /**
   * 加入共享账本
   */
  async joinLedger(inviteCode) {
    if (!inviteCode || inviteCode.length !== 6) {
      return { success: false, reason: '邀请码为6位数字' }
    }
    if (!wx.cloud) {
      return { success: false, reason: '需要云开发支持' }
    }

    try {
      const res = await wx.cloud.callFunction({
        name: 'billData',
        data: { action: 'joinLedger', inviteCode }
      })

      if (res.result && res.result.success) {
        const cloudLedger = res.result.data
        // 加入本地列表
        const list = this.getLedgerList()
        const exists = list.find(l => l.id === cloudLedger._id)
        if (!exists) {
          list.unshift({
            id: cloudLedger._id,
            name: cloudLedger.name,
            icon: cloudLedger.icon,
            type: 'shared',
            role: 'member',
            inviteCode: cloudLedger.inviteCode,
            createdAt: cloudLedger.createdAt,
            memberCount: cloudLedger.memberCount || 1
          })
          this.saveLedgerList(list)
        }
        return { success: true }
      }
      return { success: false, reason: res.result.reason || '加入失败' }
    } catch (e) {
      return { success: false, reason: '网络错误' }
    }
  },

  /**
   * 退出共享账本
   */
  async leaveLedger(ledgerId) {
    const list = this.getLedgerList()
    const ledgerItem = list.find(l => l.id === ledgerId)
    if (!ledgerItem || ledgerItem.type !== 'shared') {
      return { success: false, reason: '非共享账本' }
    }

    const cloudId = ledgerItem.cloudId || ledgerId

    // 云端退出
    if (wx.cloud) {
      try {
        const res = await wx.cloud.callFunction({
          name: 'billData',
          data: { action: 'leaveLedger', ledgerId: cloudId }
        })
        const result = res.result || {}
        if (result.reason) {
          return { success: false, reason: result.reason }
        }
        if (result.dissolved) {
          // 账本已解散，清理本地所有相关缓存
          this._clearLedgerCache(ledgerId)
        }
      } catch (e) {
        return { success: false, reason: '网络错误，请重试' }
      }
    }

    // 本地移除
    const newList = list.filter(l => l.id !== ledgerId)
    this.saveLedgerList(newList)

    // 切到第一个账本
    if (newList.length > 0) {
      this.switchLedger(newList[0].id)
    }

    return { success: true }
  },

  // ========== 数据缓存（共享账本） ==========

  _cacheKey(ledgerId, type) {
    return this.KEYS.LEDGER_CACHE + ledgerId + '_' + type
  },

  /**
   * 获取缓存的账单
   */
  getCachedBills(ledgerId) {
    return storage.cachedGet(this._cacheKey(ledgerId, 'bills')) || []
  },

  setCachedBills(ledgerId, bills) {
    storage.cachedSet(this._cacheKey(ledgerId, 'bills'), bills)
  },

  /**
   * 获取缓存的成员
   */
  getCachedMembers(ledgerId) {
    return storage.cachedGet(this._cacheKey(ledgerId, 'members')) || []
  },

  setCachedMembers(ledgerId, members) {
    storage.cachedSet(this._cacheKey(ledgerId, 'members'), members)
  },

  // ========== 乐观写 ==========

  /**
   * 添加账单（共享账本模式）
   * 1. 立即写本地缓存
   * 2. 后台推云端
   */
  optimisticAddBill(ledgerId, bill) {
    // ledgerId 可能是本地 id，转换为 cloudId
    const cloudId = this.getCloudId(ledgerId)
    const cache = this.getCachedBills(ledgerId)
    cache.unshift(bill)
    this.setCachedBills(ledgerId, cache)

    // 后台推云（用 cloudId）
    if (wx.cloud) {
      wx.cloud.callFunction({
        name: 'billData',
        data: { action: 'addBill', ledgerId: cloudId, data: bill }
      }).then(res => {
        if (res.result && res.result.success && res.result._id) {
          // 回写 cloudId 到本地缓存
          const current = this.getCachedBills(ledgerId)
          const added = current.find(b => b.id === bill.id)
          if (added) {
            added.cloudId = res.result._id
            this.setCachedBills(ledgerId, current)
          }
        }
        // 静默拉真数据
        this.refreshBills(ledgerId)
      }).catch(err => {
        // 回滚
        console.warn('推送失败，回滚:', err)
        const current = this.getCachedBills(ledgerId)
        const rolled = current.filter(b => b.id !== bill.id)
        this.setCachedBills(ledgerId, rolled)
      })
    }

    return { success: true, _optimistic: true }
  },

  /**
   * 从云端刷新账单
   */
  async refreshBills(ledgerId) {
    if (!wx.cloud) return
    const cloudId = this.getCloudId(ledgerId)
    try {
      const res = await wx.cloud.callFunction({
        name: 'billData',
        data: { action: 'getLedgerBills', ledgerId: cloudId, limit: 200 }
      })
      if (res.result && res.result.success) {
        this.setCachedBills(ledgerId, res.result.data)
      }
    } catch (e) {
      console.warn('刷新账单失败:', e)
    }
  },

  /**
   * 删除共享账本账单（先删本地缓存，再推云）
   */
  optimisticDeleteBill(ledgerId, billId) {
    const cache = this.getCachedBills(ledgerId)
    const target = cache.find(b => b.id === billId)
    const filtered = cache.filter(b => b.id !== billId)
    this.setCachedBills(ledgerId, filtered)

    const cloudId = this.getCloudId(ledgerId)
    if (wx.cloud) {
      // 用账单的 cloudId（云数据库 _id）来删除
      const cloudBillId = target && (target.cloudId || target._id)
      if (cloudBillId) {
        wx.cloud.callFunction({
          name: 'billData',
          data: { action: 'deleteBill', billId: cloudBillId, ledgerId: cloudId }
        }).then(res => {
          if (res.result && res.result.success) {
            this.refreshBills(ledgerId)
          }
        }).catch(err => {
          console.warn('云端删除失败:', err)
          this.refreshBills(ledgerId)
        })
      } else {
        // 没有 cloudId（老数据），直接全量刷新
        this.refreshBills(ledgerId)
      }
    }
  },

  /**
   * 编辑共享账本账单（先改本地缓存，再推云）
   */
  optimisticUpdateBill(ledgerId, billId, updates) {
    const cache = this.getCachedBills(ledgerId)
    const idx = cache.findIndex(b => b.id === billId)
    if (idx >= 0) {
      cache[idx] = { ...cache[idx], ...updates, updatedAt: Date.now() }
      this.setCachedBills(ledgerId, cache)
    }

    const cloudId = this.getCloudId(ledgerId)
    if (wx.cloud) {
      // 用账单的 cloudId（云数据库 _id）来定位
      const cloudBillId = cache[idx] && (cache[idx].cloudId || cache[idx]._id)
      if (cloudBillId) {
        wx.cloud.callFunction({
          name: 'billData',
          data: { action: 'updateBill', billId: cloudBillId, ledgerId: cloudId, updates }
        }).then(res => {
          if (res.result && res.result.success) {
            this.refreshBills(ledgerId)
          }
        }).catch(err => {
          console.warn('云端编辑失败:', err)
          this.refreshBills(ledgerId)
        })
      } else {
        // 没有 cloudId（老数据），直接全量刷新拉最新
        this.refreshBills(ledgerId)
      }
    }
  },

  /**
   * 清理账本相关缓存（统一方法）
   */
  _clearLedgerCache(ledgerId) {
    const types = ['bills', 'members', 'accounts']
    types.forEach(t => {
      try { wx.removeStorageSync(this._cacheKey(ledgerId, t)) } catch (e) {}
    })
    try { wx.removeStorageSync(this.KEYS.LEDGER_CACHE + ledgerId) } catch (e) {}
  },

  // ========== 工具 ==========

  _genInviteCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    let code = ''
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)]
    return code
  },

  _getLedgerIcon(type) {
    const icons = ['📒', '📕', '📗', '📘', '📙', '📓', '📔']
    return icons[Math.floor(Math.random() * icons.length)]
  }
}

module.exports = LedgerManager
