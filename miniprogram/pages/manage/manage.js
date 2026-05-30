// pages/manage/manage.js — 管理（账户/预算/账本/导出/设置）

const util = require('../../utils/util')
const storage = require('../../utils/storage')
const validator = require('../../utils/validator')
const ledger = require('../../utils/ledger')

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
    showBudgetModal: false,
    budgetInput: '',
    // 清除
    showClearModal: false,
    // 人员
    members: [],
    showMemberModal: false,
    newMemberName: ''
  },

  onShow() {
    this.loadData()
  },

  loadData() {
    const current = ledger.getCurrentLedger()
    const list = ledger.initDefaultLedger()
    const stats = storage.getOverallStats()
    const accounts = storage.getAccounts()
    const totalAssets = accounts.reduce((s, a) => s + (a.balance || 0), 0)
    const budget = storage.getBudget()
    const members = storage.getMembers()

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
      members
    })
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
    const code = this.data.joinCode.trim()
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
    wx.showModal({
      title: '删除人员',
      content: '删除后历史记录仍会保留',
      success: (res) => {
        if (res.confirm) {
          storage.removeMember(id)
          this.setData({ members: storage.getMembers() })
        }
      }
    })
  },

  // ========== 导出 ==========

  exportData() {
    const bills = storage.getBills()
    if (bills.length === 0) {
      wx.showToast({ title: '没有数据可导出', icon: 'none' }); return
    }
    let csv = '日期,类型,分类,金额(元),备注,账户\n'
    bills.forEach(b => {
      const cat = require('../../data/categories').getCategoryBy(b.category, b.type)
      csv += `${util.formatDate(b.date)},${b.type === 'income' ? '收入' : '支出'},${cat.name},${(b.amount/100).toFixed(2)},${b.note || ''},${b.account}\n`
    })
    wx.setClipboardData({
      data: csv,
      success: () => wx.showToast({ title: '已复制到剪贴板', icon: 'success' })
    })
  },

  // ========== 清除 ==========

  showClearConfirm() { this.setData({ showClearModal: true }) },
  cancelClear() { this.setData({ showClearModal: false }) },
  clearAllData() {
    wx.clearStorageSync()
    this.setData({ showClearModal: false })
    this.loadData()
    wx.showToast({ title: '数据已清除', icon: 'success' })
  }
})
