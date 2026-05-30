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
    try {
      return wx.getStorageSync(this.KEYS.CURRENT_LEDGER) || { inLedger: false }
    } catch (e) {
      return { inLedger: false }
    }
  },

  /**
   * 是否在共享账本中
   */
  isInLedger() {
    return this.getCurrentLedger().inLedger === true
  },

  /**
   * 切换账本
   */
  switchLedger(ledgerId) {
    const list = this.getLedgerList()
    const ledger = list.find(l => l.id === ledgerId)
    if (ledger) {
      const info = {
        id: ledger.id,
        name: ledger.name,
        type: ledger.type,   // 'personal' | 'shared'
        role: ledger.role,    // 'owner' | 'member'
        icon: ledger.icon,
        inLedger: ledger.type === 'shared'
      }
      wx.setStorageSync(this.KEYS.CURRENT_LEDGER, info)
      return { success: true, info }
    }
    // 切到个人模式
    wx.setStorageSync(this.KEYS.CURRENT_LEDGER, { inLedger: false, type: 'personal' })
    return { success: true, info: { inLedger: false, type: 'personal' } }
  },

  // ========== 账本列表 ==========

  getLedgerList() {
    try {
      return wx.getStorageSync(this.KEYS.LEDGER_LIST) || []
    } catch (e) {
      return []
    }
  },

  saveLedgerList(list) {
    try {
      wx.setStorageSync(this.KEYS.LEDGER_LIST, list)
    } catch (e) {
      console.error('保存账本列表失败:', e)
    }
  },

  /**
   * 初始化默认个人账本
   */
  initDefaultLedger() {
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
    try { wx.removeStorageSync(this.KEYS.LEDGER_CACHE + ledgerId) } catch (e) {}

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
        wx.setStorageSync(this.KEYS.CURRENT_LEDGER, info)
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
    const ledger = list.find(l => l.id === ledgerId)
    if (!ledger || ledger.type !== 'shared') {
      return { success: false, reason: '非共享账本' }
    }

    // 云端退出
    if (wx.cloud) {
      try {
        await wx.cloud.callFunction({
          name: 'billData',
          data: { action: 'leaveLedger', ledgerId }
        })
      } catch (e) {}
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
    try {
      return wx.getStorageSync(this._cacheKey(ledgerId, 'bills')) || []
    } catch (e) {
      return []
    }
  },

  setCachedBills(ledgerId, bills) {
    try {
      wx.setStorageSync(this._cacheKey(ledgerId, 'bills'), bills)
    } catch (e) {}
  },

  /**
   * 获取缓存的成员
   */
  getCachedMembers(ledgerId) {
    try {
      return wx.getStorageSync(this._cacheKey(ledgerId, 'members')) || []
    } catch (e) {
      return []
    }
  },

  setCachedMembers(ledgerId, members) {
    try {
      wx.setStorageSync(this._cacheKey(ledgerId, 'members'), members)
    } catch (e) {}
  },

  // ========== 乐观写 ==========

  /**
   * 添加账单（共享账本模式）
   * 1. 立即写本地缓存
   * 2. 后台推云端
   */
  optimisticAddBill(ledgerId, bill) {
    const cache = this.getCachedBills(ledgerId)
    cache.unshift(bill)
    this.setCachedBills(ledgerId, cache)

    // 后台推云
    if (wx.cloud) {
      wx.cloud.callFunction({
        name: 'billData',
        data: { action: 'addBill', ledgerId, data: bill }
      }).then(res => {
        if (res.result && res.result.success) {
          // 静默拉真数据
          this.refreshBills(ledgerId)
        }
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
    try {
      const res = await wx.cloud.callFunction({
        name: 'billData',
        data: { action: 'getLedgerBills', ledgerId, limit: 200 }
      })
      if (res.result && res.result.success) {
        this.setCachedBills(ledgerId, res.result.data)
      }
    } catch (e) {
      console.warn('刷新账单失败:', e)
    }
  },

  // ========== 工具 ==========

  _genInviteCode() {
    return String(Math.floor(100000 + Math.random() * 900000))
  },

  _getLedgerIcon(type) {
    const icons = ['📒', '📕', '📗', '📘', '📙', '📓', '📔']
    return icons[Math.floor(Math.random() * icons.length)]
  }
}

module.exports = LedgerManager
