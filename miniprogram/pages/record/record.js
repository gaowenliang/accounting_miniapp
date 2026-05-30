// pages/record/record.js — 记账页（自定义键盘版）

const util = require('../../utils/util')
const storage = require('../../utils/storage')
const validator = require('../../utils/validator')
const categories = require('../../data/categories')
const ledger = require('../../utils/ledger')

Page({
  data: {
    // 账本
    currentLedger: null,
    // 类型
    billType: 'expense',
    // 金额
    amountStr: '',
    // 分类
    categoryList: [],
    selectedCategory: '',
    selectedCategoryInfo: { icon: '📦', name: '分类' },
    showCategories: false,
    // 备注
    note: '',
    // 日期
    dateText: '今天',
    billDate: 0,
    // 账户
    accounts: [],
    selectedAccount: 'wechat',
    selectedAccountName: '微信支付',
    // 人员
    members: [],
    selectedPayer: 'self',
    currentPayerName: '我',
    showPayerModal: false,
    showAddMemberModal: false,
    newMemberName: '',
    // 键盘
    quickAmounts: ['5', '10', '20', '50', '100', '200'],
  },

  onLoad() {
    ledger.initDefaultLedger()
    this.initData()
  },

  onShow() {
    this.refreshLedgerInfo()
    const members = storage.getMembers()
    this.setData({
      accounts: storage.getAccounts(),
      members,
      currentPayerName: this.getPayerName(this.data.selectedPayer, members)
    })
  },

  getPayerName(payerId, members) {
    const m = (members || storage.getMembers()).find(m => m.id === payerId)
    return m ? m.name : '我'
  },

  refreshLedgerInfo() {
    const current = ledger.getCurrentLedger()
    this.setData({ currentLedger: current, accounts: storage.getAccounts() })
    this.updateAccountName()
  },

  initData() {
    this.setData({
      billDate: Date.now(),
      dateText: '今天',
      categoryList: categories.getCategories('expense'),
      selectedCategory: '',
      selectedCategoryInfo: { icon: '📦', name: '分类' },
      accounts: storage.getAccounts(),
      selectedAccount: storage.getSettings().defaultAccount || 'wechat'
    })
    this.updateAccountName()
  },

  updateAccountName() {
    const acc = this.data.accounts.find(a => a.key === this.data.selectedAccount || a.id === this.data.selectedAccount)
    if (acc) this.setData({ selectedAccountName: acc.name })
  },

  // ========== 收入/支出切换 ==========
  switchType(e) {
    const type = e.currentTarget.dataset.type
    this.setData({
      billType: type,
      categoryList: categories.getCategories(type),
      selectedCategory: '',
      selectedCategoryInfo: { icon: '📦', name: '分类' },
      showCategories: false
    })
  },

  // ========== 分类 ==========
  showCategoryPicker() {
    this.setData({ showCategories: !this.data.showCategories })
  },

  selectCategory(e) {
    const key = e.currentTarget.dataset.key
    const cat = categories.getCategoryBy(key, this.data.billType)
    this.setData({
      selectedCategory: key,
      selectedCategoryInfo: { icon: cat.icon, name: cat.name },
      showCategories: false
    })
  },

  // ========== 备注 ==========
  onNoteInput(e) { this.setData({ note: e.detail.value }) },

  // ========== 自定义键盘 ==========
  pressKey(e) {
    const val = e.currentTarget.dataset.val
    if (val === 'del') return this.deleteChar()
    if (val === 'ok') return this.submitBill()
    // 数字和小数点
    let str = this.data.amountStr
    if (val === '.' && str.includes('.')) return
    if (str.includes('.') && str.split('.')[1].length >= 2) return // 最多2位小数
    if (str.length >= 10) return // 总长度限制
    str += val
    this.setData({ amountStr: str })
  },

  deleteChar() {
    let str = this.data.amountStr
    if (!str) return
    str = str.slice(0, -1)
    this.setData({ amountStr: str })
  },

  quickAmount(e) {
    const val = e.currentTarget.dataset.val
    this.setData({ amountStr: val })
  },

  // ========== 快捷选项 ==========
  selectPayer() { this.setData({ showPayerModal: true }) },
  closePayerModal() { this.setData({ showPayerModal: false }) },

  pickPayer(e) {
    const id = e.currentTarget.dataset.id
    this.setData({
      selectedPayer: id,
      currentPayerName: this.getPayerName(id)
    })
  },

  toggleDate() {
    // 用系统日期选择器
    const that = this
    wx.showModal({
      title: '选择日期',
      editable: true,
      placeholderText: '格式: YYYY-MM-DD',
      content: util.formatDate(Date.now()),
      success(res) {
        if (res.confirm && res.content) {
          const [y, m, d] = res.content.split('-')
          if (y && m && d) {
            const date = new Date(y, m - 1, d).getTime()
            const today = util.todayStart()
            let dateText = res.content
            if (date === today) dateText = '今天'
            else if (date === today - 86400000) dateText = '昨天'
            that.setData({ billDate: date, dateText })
          }
        }
      }
    })
  },

  selectAccount() {
    const accounts = this.data.accounts
    const names = accounts.map(a => a.name)
    wx.showActionSheet({
      itemList: names,
      success: (res) => {
        const acc = accounts[res.tapIndex]
        this.setData({
          selectedAccount: acc.key || acc.id,
          selectedAccountName: acc.name
        })
      }
    })
  },

  toggleSplit() {
    // TODO: 打开分摊设置弹窗
    wx.showToast({ title: '分摊设置开发中', icon: 'none' })
  },

  // ========== 提交 ==========
  submitBill() {
    const amountStr = this.data.amountStr
    if (!amountStr || parseFloat(amountStr) <= 0) {
      wx.showToast({ title: '请输入金额', icon: 'none' }); return
    }
    if (!this.data.selectedCategory) {
      wx.showToast({ title: '请选择分类', icon: 'none' }); return
    }

    const amountResult = validator.validateAmount(amountStr)
    if (!amountResult.valid) {
      wx.showToast({ title: amountResult.msg, icon: 'none' }); return
    }

    const bill = {
      amount: util.yuanToFen(amountResult.value),
      type: this.data.billType,
      category: this.data.selectedCategory,
      note: this.data.note,
      account: this.data.selectedAccount,
      date: this.data.billDate || Date.now(),
      payer: this.data.selectedPayer || 'self'
    }

    const isInLedger = ledger.isInLedger()
    if (isInLedger) {
      const current = ledger.getCurrentLedger()
      bill.id = util.genId()
      bill.createdAt = Date.now()
      ledger.optimisticAddBill(current.id, bill)
    } else {
      storage.addBill(bill)
      const delta = bill.type === 'income' ? bill.amount : -bill.amount
      storage.updateAccountBalance(bill.account, delta)
    }

    // 重置
    this.setData({
      amountStr: '',
      selectedCategory: '',
      selectedCategoryInfo: { icon: '📦', name: '分类' },
      note: '',
      showCategories: false
    })

    const typeLabel = bill.type === 'income' ? '收入' : '支出'
    wx.showToast({ title: `${typeLabel} ¥${amountResult.value.toFixed(2)}`, icon: 'success', duration: 1200 })
  },

  // ========== 人员管理 ==========
  showAddMember() {
    this.setData({ showAddMemberModal: true, newMemberName: '' })
  },
  cancelAddMember() { this.setData({ showAddMemberModal: false }) },
  onNewMemberNameInput(e) { this.setData({ newMemberName: e.detail.value }) },
  confirmAddMember() {
    const name = this.data.newMemberName.trim()
    if (!name) { wx.showToast({ title: '请输入姓名', icon: 'none' }); return }
    const members = storage.addMember(name)
    this.setData({ members, showAddMemberModal: false })
    wx.showToast({ title: '已添加', icon: 'success' })
  },

  goManage() {
    wx.switchTab({ url: '/pages/manage/manage' })
  }
})
