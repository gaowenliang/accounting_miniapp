// pages/add-bill/add-bill.js — 记账页

const util = require('../../utils/util')
const storage = require('../../utils/storage')
const validator = require('../../utils/validator')
const categories = require('../../data/categories')
const cloudSync = require('../../utils/cloud-sync')

Page({
  data: {
    // 收入/支出模式
    billType: 'expense',   // 'expense' | 'income'
    typeLabel: '支出',
    // 金额
    amountStr: '',
    amount: 0,
    // 分类
    categoryList: [],
    selectedCategory: '',
    selectedCategoryName: '',
    selectedCategoryIcon: '',
    // 备注
    note: '',
    // 日期
    dateText: '今天',
    billDate: 0,
    showDatePicker: false,
    // 账户
    accounts: [],
    selectedAccount: 'wechat',
    selectedAccountName: '微信支付',
    showAccountPicker: false,
    // 状态
    submitting: false
  },

  onLoad() {
    this.initData()
  },

  onShow() {
    // 每次显示刷新账户
    this.setData({ accounts: storage.getAccounts() })
  },

  initData() {
    const billType = this.data.billType
    this.setData({
      billDate: Date.now(),
      dateText: '今天',
      categoryList: categories.getCategories(billType),
      selectedCategory: '',
      accounts: storage.getAccounts(),
      selectedAccount: storage.getSettings().defaultAccount || 'wechat'
    })
    this.updateAccountName()
  },

  // ========== 收入/支出切换 ==========

  switchType(e) {
    const type = e.currentTarget.dataset.type
    const catList = categories.getCategories(type)
    this.setData({
      billType: type,
      typeLabel: type === 'income' ? '收入' : '支出',
      categoryList: catList,
      selectedCategory: ''
    })
  },

  // ========== 金额输入 ==========

  onAmountInput(e) {
    const val = e.detail.value
    this.setData({ amountStr: val })
  },

  onAmountConfirm() {
    const val = parseFloat(this.data.amountStr)
    if (!isNaN(val) && val > 0) {
      this.setData({ amount: util.yuanToFen(val) })
    }
  },

  // ========== 分类选择 ==========

  selectCategory(e) {
    const key = e.currentTarget.dataset.key
    const cat = categories.getCategoryBy(key, this.data.billType)
    this.setData({
      selectedCategory: key,
      selectedCategoryName: cat.name,
      selectedCategoryIcon: cat.icon
    })
  },

  // ========== 备注 ==========

  onNoteInput(e) {
    this.setData({ note: e.detail.value })
  },

  // ========== 日期 ==========

  showDateAction() {
    this.setData({ showDatePicker: true })
  },

  onDateChange(e) {
    const val = e.detail.value
    const [year, month, day] = val.split('-')
    const date = new Date(year, month - 1, day).getTime()
    const today = util.todayStart()
    let dateText = val
    if (date === today) dateText = '今天'
    else if (date === today - 86400000) dateText = '昨天'

    this.setData({
      billDate: date,
      dateText,
      showDatePicker: false
    })
  },

  cancelDate() {
    this.setData({ showDatePicker: false })
  },

  // ========== 账户 ==========

  showAccountAction() {
    this.setData({ showAccountPicker: true })
  },

  selectAccount(e) {
    const key = e.currentTarget.dataset.key
    this.setData({
      selectedAccount: key,
      showAccountPicker: false
    })
    this.updateAccountName()
  },

  cancelAccount() {
    this.setData({ showAccountPicker: false })
  },

  updateAccountName() {
    const acc = this.data.accounts.find(a => a.key === this.data.selectedAccount || a.id === this.data.selectedAccount)
    if (acc) {
      this.setData({ selectedAccountName: acc.name })
    }
  },

  // ========== 提交 ==========

  async submitBill() {
    // 校验金额
    const amountResult = validator.validateAmount(this.data.amountStr)
    if (!amountResult.valid) {
      wx.showToast({ title: amountResult.msg, icon: 'none' })
      return
    }

    // 校验分类
    if (!this.data.selectedCategory) {
      wx.showToast({ title: '请选择分类', icon: 'none' })
      return
    }

    // 校验备注
    const noteResult = validator.validateNote(this.data.note)
    if (!noteResult.valid) {
      wx.showToast({ title: noteResult.msg, icon: 'none' })
      return
    }

    this.setData({ submitting: true })

    const bill = {
      amount: util.yuanToFen(amountResult.value),
      type: this.data.billType,
      category: this.data.selectedCategory,
      note: noteResult.value,
      account: this.data.selectedAccount,
      date: this.data.billDate || Date.now()
    }

    // 本地存储
    storage.addBill(bill)

    // 更新账户余额
    const delta = bill.type === 'income' ? bill.amount : -bill.amount
    storage.updateAccountBalance(bill.account, delta)

    // 推送云端
    cloudSync.pushBill(bill).catch(() => {})

    // 预算提醒
    if (bill.type === 'expense') {
      this.checkBudgetAlert(bill.amount)
    }

    this.setData({ submitting: false })

    wx.showToast({
      title: `${this.data.typeLabel} ¥${amountResult.value.toFixed(2)}`,
      icon: 'success',
      duration: 1500
    })

    // 延迟重置
    setTimeout(() => {
      this.setData({
        amountStr: '',
        amount: 0,
        selectedCategory: '',
        note: '',
        billDate: Date.now(),
        dateText: '今天'
      })
    }, 1500)
  },

  checkBudgetAlert(expenseAmount) {
    const budget = storage.getBudget()
    if (!budget.enabled || budget.amount <= 0) return

    const now = new Date()
    const stats = storage.getMonthStats(now.getFullYear(), now.getMonth())
    const percent = Math.round(stats.totalExpense / budget.amount * 100)

    if (percent >= budget.alertAt && percent < budget.alertAt + 5) {
      wx.showModal({
        title: '预算提醒',
        content: `本月支出已达预算的${percent}%，注意控制哦`,
        showCancel: false,
        confirmText: '知道了'
      })
    }
  }
})
