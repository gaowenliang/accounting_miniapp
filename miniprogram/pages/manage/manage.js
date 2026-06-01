// pages/manage/manage.js — 管理（账户/预算/账本/导出/设置）

const util = require('../../utils/util')
const storage = require('../../utils/storage')
const validator = require('../../utils/validator')
const ledger = require('../../utils/ledger')
const currencies = require('../../data/currencies')
const categories = require('../../data/categories')

Page({
  data: {
    // 账本
    ledgerList: [],
    currentLedger: null,
    showLedgerModal: false,
    newLedgerName: '',
    newLedgerType: 'personal',
    showInviteModal: false,
    inviteCode: '',
    joinCode: '',
    showJoinModal: false,
    // 统计
    totalBills: 0,
    totalDays: 0,
    // 账户
    accounts: [],
    totalAssets: 0,
    // 预算
    budgetEnabled: false,
    budgetAmount: 0,
    budgetAmountText: '',
    // 币种排序
    currencyList: [],
    // 分类排序
    catSortType: 'expense',
    catSortList: [],
    showBudgetModal: false,
    budgetInput: '',
    // 清除
    showClearModal: false,
    // 人员
    members: [],
    showMemberModal: false,
    newMemberName: '',
    // 批量添加
    showBatchAdd: false,
    batchNames: '',
    // 从历史导入
    showHistoryImport: false,
    deletedMembers: [],
    historySelected: [],
    // 账本概览
    overview: { memberCount: 0, currencies: [], totalExpenseCNY: 0, expenseByCurrency: [], totalIncomeCNY: 0 },
    // 分组
    showGroupManager: false,
    memberGroups: [],
    newGroupName: '',
    editingGroupId: null,
    showAssignGroup: false,
    assigningMemberId: null
  },

  onShow() {
    this.loadData()
  },

  loadData() {
    const current = ledger.getCurrentLedger()
    const list = ledger.ensureAndGetList()
    const stats = storage.getOverallStats()
    const accounts = storage.getAccounts()
    const totalAssets = accounts.reduce((s, a) => s + (a.balance || 0), 0)
    const budget = storage.getBudget()
    const members = storage.getMembers()

    // 计算账本概览
    const bills = storage.getBills()
    const currencySet = new Set()
    const expenseMap = {}
    let totalExpenseCNY = 0, totalIncomeCNY = 0
    bills.forEach(b => {
      const cur = b.currency || 'CNY'
      const amt = b.amount || 0
      const amtCNY = b.amountCNY || amt
      currencySet.add(cur)
      if (!expenseMap[cur]) expenseMap[cur] = 0
      if (b.type === 'expense') {
        expenseMap[cur] += amt
        totalExpenseCNY += amtCNY
      } else {
        totalIncomeCNY += amtCNY
      }
    })
    const currencyList2 = Array.from(currencySet).map(code => {
      const info = currencies.getCurrency(code)
      return { code, name: info.name, flag: info.flag }
    })
    const expenseList = Object.keys(expenseMap).filter(k => expenseMap[k] > 0).map(code => {
      const info = currencies.getCurrency(code)
      return { code, symbol: info.symbol, name: info.name, amount: expenseMap[code] }
    })

    this.setData({
      ledgerList: list,
      currentLedger: current,
      totalBills: stats.totalBills,
      totalDays: stats.totalDays,
      accounts,
      totalAssets,
      budgetEnabled: budget.enabled,
      budgetAmount: budget.amount,
      budgetAmountText: budget.amount > 0 ? (budget.amount / 100).toFixed(0) : '0',
      members,
      currencyList: currencies.getAllCurrencies(),
      catSortList: categories.getCategories(this.data.catSortType),
      overview: {
        memberCount: members.length,
        currencies: currencyList2,
        totalExpenseCNY,
        totalIncomeCNY,
        expenseByCurrency: expenseList
      }
    })

    // 加载分组信息，给成员附加分组标签
    const memberGroups = storage.getMemberGroups()
    const membersWithGroups = this.data.members.map(m => {
      const groups = memberGroups.filter(g => g.memberIds.includes(m.id)).map(g => g.name)
      return { ...m, groups }
    })
    this.setData({ members: membersWithGroups, memberGroups })
  },

  // ========== 账本切换 ==========

  switchLedgerTap(e) {
    const id = e.currentTarget.dataset.id
    const result = ledger.switchLedger(id)
    if (result.success) {
      this.loadData()
      wx.showToast({ title: `已切换到 ${result.info.name || '个人'}`, icon: 'none' })
    }
  },

  goLedgerDetail(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/ledger/ledger?id=${id}` })
  },

  // ========== 创建账本 ==========

  showCreateLedger() {
    this.setData({ showLedgerModal: true, newLedgerName: '', newLedgerType: 'personal' })
  },

  cancelCreateLedger() {
    this.setData({ showLedgerModal: false })
  },

  onNewLedgerNameInput(e) {
    this.setData({ newLedgerName: e.detail.value })
  },

  switchLedgerType(e) {
    this.setData({ newLedgerType: e.currentTarget.dataset.type })
  },

  confirmCreateLedger() {
    const name = this.data.newLedgerName.trim()
    if (!name) { wx.showToast({ title: '请输入账本名称', icon: 'none' }); return }
    if (name.length > 10) { wx.showToast({ title: '名称最多10个字', icon: 'none' }); return }

    const newLedger = ledger.createLedger(name, this.data.newLedgerType)
    this.setData({ showLedgerModal: false })
    this.loadData()
    wx.showToast({ title: `已创建「${name}」`, icon: 'success' })
  },

  // ========== 邀请 ==========

  showInvite() {
    const current = ledger.getCurrentLedger()
    if (!current || current.type !== 'shared') {
      wx.showToast({ title: '只有共享账本才能邀请', icon: 'none' }); return
    }
    const code = ledger.getInviteCode(current.id)
    this.setData({ showInviteModal: true, inviteCode: code })
  },

  copyInviteCode() {
    wx.setClipboardData({
      data: this.data.inviteCode,
      success: () => wx.showToast({ title: '已复制邀请码', icon: 'success' })
    })
  },

  cancelInvite() {
    this.setData({ showInviteModal: false })
  },

  // ========== 加入 ==========

  showJoin() {
    this.setData({ showJoinModal: true, joinCode: '' })
  },

  onJoinCodeInput(e) {
    this.setData({ joinCode: e.detail.value })
  },

  async confirmJoin() {
    const code = this.data.joinCode.trim().toUpperCase()
    if (code.length !== 6) {
      wx.showToast({ title: '邀请码为6位数字', icon: 'none' }); return
    }
    wx.showLoading({ title: '加入中...' })
    const result = await ledger.joinLedger(code)
    wx.hideLoading()
    if (result.success) {
      this.setData({ showJoinModal: false })
      this.loadData()
      wx.showToast({ title: '加入成功', icon: 'success' })
    } else {
      wx.showToast({ title: result.reason, icon: 'none' })
    }
  },

  cancelJoin() {
    this.setData({ showJoinModal: false })
  },

  // ========== 账户 ==========

  addAccount() {
    wx.showModal({
      title: '添加账户',
      editable: true,
      placeholderText: '账户名称，如：招商银行',
      success: (res) => {
        if (res.confirm && res.content) {
          const result = validator.validateAccountName(res.content)
          if (result.valid) {
            storage.addAccount({ name: result.value, icon: '💳', type: 'bank' })
            this.loadData()
            wx.showToast({ title: '已添加', icon: 'success' })
          } else {
            wx.showToast({ title: result.msg, icon: 'none' })
          }
        }
      }
    })
  },

  // ========== 预算 ==========

  showBudgetSetting() {
    const budget = storage.getBudget()
    this.setData({
      showBudgetModal: true,
      budgetInput: budget.amount > 0 ? (budget.amount / 100).toString() : ''
    })
  },

  onBudgetInput(e) {
    this.setData({ budgetInput: e.detail.value })
  },

  saveBudget() {
    const result = validator.validateBudget(this.data.budgetInput)
    if (!result.valid) { wx.showToast({ title: result.msg, icon: 'none' }); return }
    const fen = util.yuanToFen(result.value)
    storage.saveBudget({ amount: fen, enabled: true, alertAt: 80 })
    this.setData({
      showBudgetModal: false,
      budgetEnabled: true,
      budgetAmount: fen,
      budgetAmountText: result.value.toFixed(0)
    })
    wx.showToast({ title: '预算已设置', icon: 'success' })
  },

  disableBudget() {
    storage.saveBudget({ amount: 0, enabled: false, alertAt: 80 })
    this.setData({ budgetEnabled: false, budgetAmount: 0, budgetAmountText: '0' })
    wx.showToast({ title: '已关闭预算', icon: 'none' })
  },

  cancelBudget() { this.setData({ showBudgetModal: false }) },

  // ========== 人员管理 ==========

  showAddMemberModal() {
    this.setData({ showMemberModal: true, newMemberName: '' })
  },
  cancelAddMember() { this.setData({ showMemberModal: false }) },
  onMemberNameInput(e) { this.setData({ newMemberName: e.detail.value }) },
  confirmAddMember() {
    const name = this.data.newMemberName.trim()
    if (!name) { wx.showToast({ title: '请输入姓名', icon: 'none' }); return }
    const members = storage.addMember(name)
    this.setData({ members, showMemberModal: false })
    wx.showToast({ title: '已添加', icon: 'success' })
  },
  removeMember(e) {
    const id = e.currentTarget.dataset.id
    const member = this.data.members.find(m => m.id === id)
    const name = member ? member.name : '该成员'
    // 检查是否有关联账单
    const bills = storage.getBills().filter(b => (b.payer || 'self') === id)
    const billInfo = bills.length > 0 ? `\n该成员有 ${bills.length} 条历史记录，删除后记录会显示为「未知」` : ''
    wx.showModal({
      title: '删除人员',
      content: `确定删除「${name}」？${billInfo}`,
      success: (res) => {
        if (res.confirm) {
          storage.removeMember(id)
          this.setData({ members: storage.getMembers() })
        }
      }
    })
  },

  // ===== 批量添加 =====

  openBatchAdd() {
    this.setData({ showBatchAdd: true, batchNames: '' })
  },

  closeBatchAdd() {
    this.setData({ showBatchAdd: false })
  },

  onBatchInput(e) {
    this.setData({ batchNames: e.detail.value })
  },

  saveBatchAdd() {
    const names = this.data.batchNames.split('\n')
      .map(n => n.trim())
      .filter(n => n.length > 0)
    if (names.length === 0) {
      wx.showToast({ title: '请输入成员名', icon: 'none' })
      return
    }
    const members = storage.getMembers()
    const existNames = members.map(m => m.name)
    let added = 0
    names.forEach(name => {
      if (!existNames.includes(name)) {
        members.push({
          id: 'member_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
          name,
          avatar: '😊',
          isDefault: false,
          createdAt: Date.now()
        })
        existNames.push(name)
        added++
      }
    })
    storage.saveMembers(members)
    this.setData({ showBatchAdd: false, members, batchNames: '' })
    wx.showToast({ title: `已添加${added}人`, icon: 'success' })
  },

  // ===== 从历史导入 =====

  openHistoryImport() {
    const deletedMembers = storage.getDeletedMembers()
    if (deletedMembers.length === 0) {
      wx.showToast({ title: '暂无历史成员', icon: 'none' })
      return
    }
    this.setData({ showHistoryImport: true, deletedMembers, historySelected: [] })
  },

  closeHistoryImport() {
    this.setData({ showHistoryImport: false })
  },

  toggleHistoryItem(e) {
    const name = e.currentTarget.dataset.name
    let selected = [...this.data.historySelected]
    const idx = selected.indexOf(name)
    if (idx >= 0) {
      selected.splice(idx, 1)
    } else {
      selected.push(name)
    }
    this.setData({ historySelected: selected })
  },

  confirmHistoryImport() {
    const selected = this.data.historySelected
    if (selected.length === 0) {
      wx.showToast({ title: '请选择成员', icon: 'none' })
      return
    }
    const members = storage.getMembers()
    const existNames = members.map(m => m.name)
    let added = 0
    selected.forEach(name => {
      if (!existNames.includes(name)) {
        const info = this.data.deletedMembers.find(h => h.name === name)
        members.push({
          id: 'member_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
          name,
          avatar: (info && info.avatar) || '😊',
          isDefault: false,
          createdAt: Date.now()
        })
        existNames.push(name)
        added++
      }
    })
    storage.saveMembers(members)
    // 清除已导入的历史记录
    const remaining = this.data.deletedMembers.filter(h => !selected.includes(h.name))
    storage.saveDeletedMembers(remaining)
    this.setData({ showHistoryImport: false, members, historySelected: [] })
    wx.showToast({ title: `已导入${added}人`, icon: 'success' })
  },

  // ========== 成员分组 ==========

  openGroupManager() {
    this.setData({
      showGroupManager: true,
      memberGroups: storage.getMemberGroups()
    })
  },

  closeGroupManager() {
    this.setData({ showGroupManager: false })
  },

  onGroupNameInput(e) {
    this.setData({ newGroupName: e.detail.value })
  },

  createGroup() {
    const name = this.data.newGroupName.trim()
    if (!name) {
      wx.showToast({ title: '请输入分组名', icon: 'none' }); return
    }
    const groups = storage.getMemberGroups()
    if (groups.find(g => g.name === name)) {
      wx.showToast({ title: '分组已存在', icon: 'none' }); return
    }
    groups.push({
      id: 'group_' + Date.now(),
      name,
      memberIds: [],
      createdAt: Date.now()
    })
    storage.saveMemberGroups(groups)
    this.setData({ memberGroups: groups, newGroupName: '' })
    wx.showToast({ title: '分组已创建', icon: 'success' })
  },

  deleteGroup(e) {
    const id = e.currentTarget.dataset.id
    const groups = storage.getMemberGroups().filter(g => g.id !== id)
    storage.saveMemberGroups(groups)
    this.setData({ memberGroups: groups })
  },

  openAssignGroup(e) {
    const memberId = e.currentTarget.dataset.id
    this.setData({
      showAssignGroup: true,
      assigningMemberId: memberId,
      memberGroups: storage.getMemberGroups()
    })
  },

  closeAssignGroup() {
    this.setData({ showAssignGroup: false })
  },

  toggleMemberGroup(e) {
    const groupId = e.currentTarget.dataset.id
    const memberId = this.data.assigningMemberId
    const groups = storage.getMemberGroups()
    const group = groups.find(g => g.id === groupId)
    if (!group) return
    const idx = group.memberIds.indexOf(memberId)
    if (idx >= 0) {
      group.memberIds.splice(idx, 1)
    } else {
      group.memberIds.push(memberId)
    }
    storage.saveMemberGroups(groups)
    this.setData({ memberGroups: groups })
  },

  // ========== 导出 ==========

  exportData() {
    const bills = storage.getBills()
    if (bills.length === 0) {
      wx.showToast({ title: '没有数据可导出', icon: 'none' }); return
    }

    wx.showActionSheet({
      itemList: ['复制到剪贴板', '保存为文件'],
      success: (res) => {
        let csv = '\uFEFF'  // BOM 头，Excel 兼容中文
        csv += '日期,类型,分类,金额(元),币种,汇率,人民币等值(元),备注,账户,付款人\n'
        const members = storage.getMembers()
        bills.forEach(b => {
          const cat = categories.getCategoryBy(b.category, b.type)
          const payer = members.find(m => m.id === (b.payer || 'self'))
          // CSV 注入防护
          let note = b.note || ''
          if (/^[=+@\-]/.test(note)) note = "'" + note
          const rate = b.exchangeRate || 1
          const amountCNY = b.amountCNY || b.amount
          csv += `${util.formatDate(b.date)},${b.type === 'income' ? '收入' : '支出'},${cat.name},${(b.amount/100).toFixed(2)},${b.currency || 'CNY'},${rate},${(amountCNY/100).toFixed(2)},${note},${b.account},${payer ? payer.name : '我'}\n`
        })

        if (res.tapIndex === 0) {
          // 复制到剪贴板
          wx.setClipboardData({
            data: csv,
            success: () => wx.showToast({ title: '已复制到剪贴板', icon: 'success' })
          })
        } else if (res.tapIndex === 1) {
          // 保存为文件
          const fs = wx.getFileSystemManager()
          const fileName = `账单_${util.formatDate(Date.now())}.csv`
          const filePath = `${wx.env.USER_DATA_PATH}/${fileName}`
          fs.writeFile({
            filePath,
            data: csv,
            encoding: 'utf8',
            success: () => {
              wx.shareFileMessage({
                filePath,
                fileName,
                success: () => wx.showToast({ title: '已发送', icon: 'success' }),
                fail: () => {
                  // 分享失败就打开文件
                  wx.openDocument({
                    filePath,
                    showMenu: true,
                    success: () => wx.showToast({ title: '已打开', icon: 'success' })
                  })
                }
              })
            },
            fail: () => wx.showToast({ title: '保存失败', icon: 'none' })
          })
        }
      }
    })
  },

  // ========== 清除 ==========

  showClearConfirm() { this.setData({ showClearModal: true }) },
  cancelClear() { this.setData({ showClearModal: false }) },
  clearAllData() {
    // 清业务数据
    const keysToClear = ['bills', 'accounts', 'budget', 'members', 'categories_expense', 'categories_income',
      'ledgerList', 'currentLedger', 'currency_order', 'exchange_rates']
    keysToClear.forEach(key => {
      try { wx.removeStorageSync(key) } catch (e) {}
    })
    // 清所有 ledger 缓存
    try {
      const res = wx.getStorageInfoSync()
      res.keys.forEach(key => {
        if (key.startsWith('ledgerCache_')) wx.removeStorageSync(key)
      })
    } catch (e) {}
    // 重新初始化默认数据
    ledger.initDefaultLedger()
    this.setData({ showClearModal: false })
    this.loadData()
    wx.showToast({ title: '数据已清除', icon: 'success' })
  },

  onShareAppMessage() {
    const bills = storage.getBills()
    const totalExpense = bills.filter(b => b.type === 'expense')
      .reduce((s, b) => s + (b.amountCNY || b.amount), 0)
    return {
      title: `记账本 - ${Math.round(totalExpense/100)}笔支出 ¥${(totalExpense/100).toFixed(2)}`,
      path: '/pages/record/record',
      imageUrl: '' // 使用默认截图
    }
  },

  // ===== 备份/恢复 =====
  backupData() {
    wx.showLoading({ title: '备份中...' })
    try {
      const backup = {
        version: 2,
        exportedAt: Date.now(),
        bills: storage.getBills(),
        accounts: storage.getAccounts(),
        members: storage.getMembers(),
        budget: storage.getBudget(),
        settings: storage.getSettings(),
        ledgerList: ledger.getLedgerList()
      }
      wx.hideLoading()

      wx.showActionSheet({
        itemList: ['复制到剪贴板', '保存为文件'],
        success: (res) => {
          const json = JSON.stringify(backup)
          if (res.tapIndex === 0) {
            wx.setClipboardData({
              data: json,
              success: () => wx.showToast({ title: '备份已复制', icon: 'success' })
            })
          } else {
            const fs = wx.getFileSystemManager()
            const fileName = `记账备份_${util.formatDate(Date.now())}.json`
            const filePath = `${wx.env.USER_DATA_PATH}/${fileName}`
            fs.writeFile({
              filePath,
              data: json,
              encoding: 'utf8',
              success: () => {
                wx.shareFileMessage({
                  filePath,
                  fileName,
                  fail: () => {
                    wx.openDocument({ filePath, showMenu: true })
                  }
                })
              },
              fail: () => wx.showToast({ title: '保存失败', icon: 'none' })
            })
          }
        }
      })
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: '备份失败', icon: 'none' })
    }
  },

  restoreData() {
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: ['json'],
      success: (res) => {
        const filePath = res.tempFiles[0].path
        try {
          const fs = wx.getFileSystemManager()
          const content = fs.readFileSync(filePath, 'utf8')
          const data = JSON.parse(content)

          // 校验格式
          if (!data.version || !data.bills) {
            wx.showToast({ title: '文件格式不对', icon: 'none' }); return
          }

          wx.showModal({
            title: '⚠️ 恢复数据',
            content: `将覆盖当前数据（${data.bills.length}条记录）。确定恢复？`,
            success: (modalRes) => {
              if (!modalRes.confirm) return
              // 恢复数据
              if (data.bills) storage.saveBills(data.bills)
              if (data.accounts) storage.saveAccounts(data.accounts)
              if (data.members) storage.saveMembers(data.members)
              if (data.budget) storage.saveBudget(data.budget)
              if (data.settings) storage.saveSettings(data.settings)
              if (data.ledgerList) ledger.saveLedgerList(data.ledgerList)

              this.loadData()
              wx.showToast({ title: '恢复成功', icon: 'success' })
            }
          })
        } catch (e) {
          wx.showToast({ title: '文件解析失败', icon: 'none' })
        }
      }
    })
  },

  // ===== 币种排序 =====
  moveCurrencyUp(e) {
    const idx = e.currentTarget.dataset.idx
    if (idx <= 0) return
    const list = [...this.data.currencyList]
    ;[list[idx - 1], list[idx]] = [list[idx], list[idx - 1]]
    this.setData({ currencyList: list })
    currencies.saveCurrencyOrder(list.map(c => c.code))
  },

  moveCurrencyDown(e) {
    const idx = e.currentTarget.dataset.idx
    const list = [...this.data.currencyList]
    if (idx >= list.length - 1) return
    ;[list[idx], list[idx + 1]] = [list[idx + 1], list[idx]]
    this.setData({ currencyList: list })
    currencies.saveCurrencyOrder(list.map(c => c.code))
  },

  resetCurrencyOrder() {
    try { wx.removeStorageSync('currency_order') } catch (e) {}
    this.setData({ currencyList: currencies.getAllCurrencies() })
    wx.showToast({ title: '已恢复默认', icon: 'success' })
  },

  // ===== 分类排序 =====
  switchCatSort(e) {
    const type = e.currentTarget.dataset.type
    this.setData({ catSortType: type, catSortList: categories.getCategories(type) })
  },

  moveCatUp(e) {
    const idx = e.currentTarget.dataset.idx
    if (idx <= 0) return
    const list = [...this.data.catSortList]
    ;[list[idx - 1], list[idx]] = [list[idx], list[idx - 1]]
    this.setData({ catSortList: list })
    categories.saveCategories(this.data.catSortType, list)
  },

  moveCatDown(e) {
    const idx = e.currentTarget.dataset.idx
    const list = [...this.data.catSortList]
    if (idx >= list.length - 1) return
    ;[list[idx], list[idx + 1]] = [list[idx + 1], list[idx]]
    this.setData({ catSortList: list })
    categories.saveCategories(this.data.catSortType, list)
  },

  resetCatOrder() {
    categories.resetCategories()
    this.setData({ catSortList: categories.getCategories(this.data.catSortType) })
    wx.showToast({ title: '已恢复默认', icon: 'success' })
  },
})
