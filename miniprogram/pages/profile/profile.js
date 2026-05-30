// pages/profile/profile.js — 我的

const util = require('../../utils/util')
const storage = require('../../utils/storage')
const validator = require('../../utils/validator')

Page({
  data: {
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
    // 设置
    showClearModal: false
  },

  onShow() {
    this.loadData()
  },

  loadData() {
    const stats = storage.getOverallStats()
    const accounts = storage.getAccounts()
    const totalAssets = accounts.reduce((s, a) => s + (a.balance || 0), 0)
    const budget = storage.getBudget()

    this.setData({
      totalBills: stats.totalBills,
      totalDays: stats.totalDays,
      accounts,
      totalAssets,
      budgetEnabled: budget.enabled,
      budgetAmount: budget.amount,
      budgetAmountText: budget.amount > 0 ? (budget.amount / 100).toFixed(0) : '0'
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
    if (!result.valid) {
      wx.showToast({ title: result.msg, icon: 'none' })
      return
    }
    const fen = util.yuanToFen(result.value)
    storage.saveBudget({
      amount: fen,
      enabled: true,
      alertAt: 80
    })
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

  cancelBudget() {
    this.setData({ showBudgetModal: false })
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

  deleteAccount(e) {
    const id = e.currentTarget.dataset.id
    const account = this.data.accounts.find(a => a.id === id)
    wx.showModal({
      title: '删除账户',
      content: `确定删除「${account.name}」？余额数据将清零。`,
      success: (res) => {
        if (res.confirm) {
          storage.deleteAccount(id)
          this.loadData()
          wx.showToast({ title: '已删除', icon: 'success' })
        }
      }
    })
  },

  // ========== 导出 ==========

  async exportData() {
    wx.showLoading({ title: '导出中...' })
    const bills = storage.getBills()
    if (bills.length === 0) {
      wx.hideLoading()
      wx.showToast({ title: '没有数据可导出', icon: 'none' })
      return
    }

    // 生成 CSV
    let csv = '日期,类型,分类,金额(元),备注,账户\n'
    bills.forEach(b => {
      const cat = require('../../data/categories').getCategoryBy(b.category, b.type)
      csv += `${util.formatDate(b.date)},${b.type === 'income' ? '收入' : '支出'},${cat.name},${(b.amount/100).toFixed(2)},${b.note || ''},${b.account}\n`
    })

    wx.hideLoading()

    // 复制到剪贴板
    wx.setClipboardData({
      data: csv,
      success: () => {
        wx.showToast({ title: '已复制到剪贴板', icon: 'success' })
      }
    })
  },

  // ========== 清除数据 ==========

  showClearConfirm() {
    this.setData({ showClearModal: true })
  },

  cancelClear() {
    this.setData({ showClearModal: false })
  },

  clearAllData() {
    wx.clearStorageSync()
    this.setData({ showClearModal: false })
    this.loadData()
    wx.showToast({ title: '数据已清除', icon: 'success' })
  }
})
