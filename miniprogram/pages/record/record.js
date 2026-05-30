// pages/record/record.js — 记账页（首页，一打开就能记）

const util = require('../../utils/util')
const storage = require('../../utils/storage')
const validator = require('../../utils/validator')
const categories = require('../../data/categories')
const ledger = require('../../utils/ledger')
const cloudSync = require('../../utils/cloud-sync')

Page({
  data: {
    // 当前账本
    currentLedger: null,
    // 收入/支出模式
    billType: 'expense',
    // 金额
    amountStr: '',
    // 分类
    categoryList: [],
    selectedCategory: '',
    // 备注
    note: '',
    // 日期
    dateText: '今天',
    billDate: 0,
    // 账户
    accounts: [],
    selectedAccount: 'wechat',
    selectedAccountName: '微信支付',
    // 快捷标签
    recentCategories: [],
    // 人员
    members: [],
    selectedPayer: 'self',
    showAddMemberModal: false,
    newMemberName: '',
    // 分摊
    splitMode: 'equal',       // 'equal' | 'custom'
    showSplitDetail: false,
    splitItems: [],            // [{memberId, name, avatar, amount(分), amountStr}]
    splitPerPerson: '0.00',
    splitRemainder: 0,
    // 今日已记
    todayCount: 0,
    todayExpense: 0,
    todayIncome: 0
  },

  onLoad() {
    ledger.initDefaultLedger()
    this.initData()
  },

  onShow() {
    this.refreshLedgerInfo()
    this.loadTodayStats()
    const members = storage.getMembers()
    this.setData({ accounts: storage.getAccounts(), members })
    this.initSplitItems(members)
  },

  refreshLedgerInfo() {
    const current = ledger.getCurrentLedger()
    this.setData({
      currentLedger: current,
      accounts: storage.getAccounts()
    })
    this.updateAccountName()
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
    this.loadRecentCategories()
    this.updateAccountName()
  },

  loadRecentCategories() {
    const bills = storage.getBills().slice(0, 20)
    const catMap = {}
    bills.forEach(b => {
      if (!catMap[b.category]) {
        const cat = categories.getCategoryBy(b.category, b.type)
        catMap[b.category] = { key: b.category, name: cat.name, icon: cat.icon, type: b.type }
      }
    })
    this.setData({ recentCategories: Object.values(catMap).slice(0, 8) })
  },

  loadTodayStats() {
    const todayBills = storage.getBillsByDay(Date.now())
    let todayExpense = 0, todayIncome = 0
    todayBills.forEach(b => {
      if (b.type === 'income') todayIncome += b.amount
      else todayExpense += b.amount
    })
    this.setData({
      todayCount: todayBills.length,
      todayExpense,
      todayIncome
    })
  },

  // ========== 收入/支出切换 ==========

  switchType(e) {
    const type = e.currentTarget.dataset.type
    this.setData({
      billType: type,
      categoryList: categories.getCategories(type),
      selectedCategory: ''
    })
  },

  // ========== 金额 ==========

  onAmountInput(e) {
    this.setData({ amountStr: e.detail.value })
    this.updateSplit()
  },

  // ========== 分类 ==========

  selectCategory(e) {
    const key = e.currentTarget.dataset.key
    this.setData({ selectedCategory: key })
  },

  quickSelect(e) {
    const dataset = e.currentTarget.dataset
    this.setData({
      selectedCategory: dataset.key,
      billType: dataset.type,
      categoryList: categories.getCategories(dataset.type)
    })
  },

  // ========== 备注 ==========

  onNoteInput(e) {
    this.setData({ note: e.detail.value })
  },

  // ========== 日期 ==========

  onDateChange(e) {
    const val = e.detail.value
    const [year, month, day] = val.split('-')
    const date = new Date(year, month - 1, day).getTime()
    const today = util.todayStart()
    let dateText = val
    if (date === today) dateText = '今天'
    else if (date === today - 86400000) dateText = '昨天'
    this.setData({ billDate: date, dateText })
  },

  // ========== 账户 ==========

  selectAccount(e) {
    const key = e.currentTarget.dataset.key
    this.setData({ selectedAccount: key })
    this.updateAccountName()
  },

  updateAccountName() {
    const acc = this.data.accounts.find(a => a.key === this.data.selectedAccount || a.id === this.data.selectedAccount)
    if (acc) this.setData({ selectedAccountName: acc.name })
  },

  // ========== 提交 ==========

  submitBill() {
    const amountResult = validator.validateAmount(this.data.amountStr)
    if (!amountResult.valid) {
      wx.showToast({ title: amountResult.msg, icon: 'none' }); return
    }
    if (!this.data.selectedCategory) {
      wx.showToast({ title: '请选择分类', icon: 'none' }); return
    }
    const noteResult = validator.validateNote(this.data.note)
    if (!noteResult.valid) {
      wx.showToast({ title: noteResult.msg, icon: 'none' }); return
    }

    // 提交

    const bill = {
      amount: util.yuanToFen(amountResult.value),
      type: this.data.billType,
      category: this.data.selectedCategory,
      note: noteResult.value,
      account: this.data.selectedAccount,
      date: this.data.billDate || Date.now(),
      payer: this.data.selectedPayer || 'self',
      splits: this.buildSplits()
    }

    const isInLedger = ledger.isInLedger()

    if (isInLedger) {
      // 共享账本：乐观写
      const current = ledger.getCurrentLedger()
      bill.id = util.genId()
      bill.createdAt = Date.now()
      ledger.optimisticAddBill(current.id, bill)
    } else {
      // 个人模式：本地存储
      storage.addBill(bill)
      const delta = bill.type === 'income' ? bill.amount : -bill.amount
      storage.updateAccountBalance(bill.account, delta)
      cloudSync.pushBill(bill).catch(() => {})
    }

    // 重置表单
    this.setData({
      amountStr: '',
      selectedCategory: '',
      note: '',
      billDate: Date.now(),
      dateText: '今天'
    })

    const typeLabel = bill.type === 'income' ? '收入' : '支出'
    wx.showToast({ title: `${typeLabel} ¥${amountResult.value.toFixed(2)}`, icon: 'success', duration: 1200 })

    this.loadTodayStats()
    this.loadRecentCategories()
  },

  // ========== 人员 ==========

  selectPayer(e) {
    this.setData({ selectedPayer: e.currentTarget.dataset.id })
  },

  showAddMember() {
    this.setData({ showAddMemberModal: true, newMemberName: '' })
  },

  cancelAddMember() { this.setData({ showAddMemberModal: false }) },

  onNewMemberNameInput(e) { this.setData({ newMemberName: e.detail.value }) },

  // ========== 分摊 ==========

  initSplitItems(members) {
    const items = members.map(m => ({
      memberId: m.id, name: m.name, avatar: m.avatar, amount: 0, amountStr: ''
    }))
    this.setData({ splitItems: items })
  },

  toggleSplit() {
    this.setData({ showSplitDetail: !this.data.showSplitDetail })
  },

  setSplitEqual() {
    this.setData({ splitMode: 'equal' })
    this.updateSplit()
  },

  setSplitCustom() {
    this.setData({ splitMode: 'custom' })
  },

  updateSplit() {
    const amountFen = util.yuanToFen(parseFloat(this.data.amountStr) || 0)
    const count = this.data.splitItems.length || 1
    const perPerson = Math.floor(amountFen / count)
    const perPersonStr = (perPerson / 100).toFixed(2)
    this.setData({ splitPerPerson: perPersonStr })
    if (this.data.splitMode === 'equal') {
      // 自动分配
      const items = this.data.splitItems.map((item, i) => ({
        ...item, amount: perPerson, amountStr: perPersonStr
      }))
      const remainder = amountFen - perPerson * count
      this.setData({ splitItems: items, splitRemainder: remainder })
    }
  },

  onSplitAmountInput(e) {
    const idx = e.currentTarget.dataset.idx
    const val = e.detail.value
    const items = [...this.data.splitItems]
    items[idx].amountStr = val
    items[idx].amount = util.yuanToFen(parseFloat(val) || 0)
    const totalSplit = items.reduce((s, i) => s + i.amount, 0)
    const amountFen = util.yuanToFen(parseFloat(this.data.amountStr) || 0)
    this.setData({ splitItems: items, splitRemainder: amountFen - totalSplit })
  },

  buildSplits() {
    if (this.data.billType !== 'expense' || this.data.members.length <= 1) return null
    if (this.data.splitMode === 'equal') return null  // 均摊由AA算法自动算
    // 自定义分摊
    return this.data.splitItems
      .filter(i => i.amount > 0)
      .map(i => ({ memberId: i.memberId, amount: i.amount }))
  },

  confirmAddMember() {
    const name = this.data.newMemberName.trim()
    if (!name) { wx.showToast({ title: '请输入姓名', icon: 'none' }); return }
    const members = storage.addMember(name)
    const newMember = members[members.length - 1]
    const splitItems = [...this.data.splitItems, {
      memberId: newMember.id, name: newMember.name, avatar: newMember.avatar, amount: 0, amountStr: ''
    }]
    this.setData({ members, selectedPayer: newMember.id, showAddMemberModal: false, splitItems })
    this.updateSplit()
    wx.showToast({ title: '已添加', icon: 'success' })
  },

  // ========== 导航 ==========

  goManage() {
    wx.switchTab({ url: '/pages/manage/manage' })
  }
})
