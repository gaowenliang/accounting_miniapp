// pages/record/record.js — 记账页（全平铺版）

const util = require('../../utils/util')
const storage = require('../../utils/storage')
const validator = require('../../utils/validator')
const categories = require('../../data/categories')
const ledger = require('../../utils/ledger')

Page({
  data: {
    currentLedger: null,
    billType: 'expense',
    amountStr: '',
    categoryList: [],
    selectedCategory: '',
    note: '',
    members: [],
    selectedPayer: 'self',
    showAddMemberModal: false,
    newMemberName: '',
    // 分摊
    splitMode: 'equal',
    splitItems: [],
    splitPerPerson: '0.00',
    splitRemainder: 0,
    // 日期/账户
    billDate: 0,
    accounts: [],
    selectedAccount: 'wechat',
  },

  onLoad() {
    ledger.initDefaultLedger()
    const now = new Date()
    this.setData({
      billDate: now.getTime(),
      categoryList: categories.getCategories('expense'),
      accounts: storage.getAccounts(),
      selectedAccount: storage.getSettings().defaultAccount || 'wechat'
    })
  },

  onShow() {
    const members = storage.getMembers()
    const current = ledger.getCurrentLedger()
    this.setData({
      members,
      currentLedger: current,
      accounts: storage.getAccounts()
    })
    this.initSplitItems(members)
  },

  // ========== 收支切换 ==========
  switchType(e) {
    const type = e.currentTarget.dataset.type
    this.setData({
      billType: type,
      categoryList: categories.getCategories(type),
      selectedCategory: ''
    })
  },

  // ========== 分类 ==========
  selectCategory(e) {
    this.setData({ selectedCategory: e.currentTarget.dataset.key })
  },

  // ========== 花费人 ==========
  pickPayer(e) {
    const id = e.currentTarget.dataset.id
    this.setData({ selectedPayer: id })
  },

  // ========== 分摊 ==========
  initSplitItems(members) {
    const items = (members || []).map(m => ({
      memberId: m.id, name: m.name, avatar: m.avatar, amount: 0, amountStr: ''
    }))
    this.setData({ splitItems: items })
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
    this.setData({ splitPerPerson: (perPerson / 100).toFixed(2) })
    if (this.data.splitMode === 'equal') {
      const items = this.data.splitItems.map(item => ({
        ...item, amount: perPerson, amountStr: (perPerson / 100).toFixed(2)
      }))
      this.setData({ splitItems: items, splitRemainder: amountFen - perPerson * count })
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

  // ========== 备注 ==========
  onNoteInput(e) { this.setData({ note: e.detail.value }) },

  // ========== 键盘 ==========
  pressKey(e) {
    const val = e.currentTarget.dataset.val
    if (val === 'del') {
      let str = this.data.amountStr
      this.setData({ amountStr: str ? str.slice(0, -1) : '' })
      this.updateSplit()
      return
    }
    if (val === 'ok') return this.submitBill()
    let str = this.data.amountStr
    if (val === '.' && str.includes('.')) return
    if (str.includes('.') && str.split('.')[1].length >= 2) return
    if (str.length >= 10) return
    str += val
    this.setData({ amountStr: str })
    this.updateSplit()
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
    if (!amountResult.valid) { wx.showToast({ title: amountResult.msg, icon: 'none' }); return }

    const bill = {
      amount: util.yuanToFen(amountResult.value),
      type: this.data.billType,
      category: this.data.selectedCategory,
      note: this.data.note,
      account: this.data.selectedAccount,
      date: this.data.billDate || Date.now(),
      payer: this.data.selectedPayer || 'self',
      splits: this.buildSplits()
    }

    if (ledger.isInLedger()) {
      const current = ledger.getCurrentLedger()
      bill.id = util.genId()
      bill.createdAt = Date.now()
      ledger.optimisticAddBill(current.id, bill)
    } else {
      storage.addBill(bill)
      const delta = bill.type === 'income' ? bill.amount : -bill.amount
      storage.updateAccountBalance(bill.account, delta)
    }

    this.setData({ amountStr: '', selectedCategory: '', note: '' })
    const label = bill.type === 'income' ? '收入' : '支出'
    wx.showToast({ title: `${label} ¥${amountResult.value.toFixed(2)}`, icon: 'success', duration: 1200 })
  },

  buildSplits() {
    if (this.data.billType !== 'expense' || this.data.members.length <= 1) return null
    if (this.data.splitMode === 'equal') return null
    return this.data.splitItems.filter(i => i.amount > 0).map(i => ({ memberId: i.memberId, amount: i.amount }))
  },

  // ========== 添加人员 ==========
  showAddMember() { this.setData({ showAddMemberModal: true, newMemberName: '' }) },
  cancelAddMember() { this.setData({ showAddMemberModal: false }) },
  onNewMemberNameInput(e) { this.setData({ newMemberName: e.detail.value }) },
  confirmAddMember() {
    const name = this.data.newMemberName.trim()
    if (!name) { wx.showToast({ title: '请输入姓名', icon: 'none' }); return }
    const members = storage.addMember(name)
    const newM = members[members.length - 1]
    const splitItems = [...this.data.splitItems, { memberId: newM.id, name: newM.name, avatar: newM.avatar, amount: 0, amountStr: '' }]
    this.setData({ members, showAddMemberModal: false, splitItems })
    this.updateSplit()
  },
})
