// pages/record/record.js — 记账页（全平铺版）

const util = require('../../utils/util')
const storage = require('../../utils/storage')
const validator = require('../../utils/validator')
const categories = require('../../data/categories')
const currencies = require('../../data/currencies')
const ledger = require('../../utils/ledger')

Page({
  data: {
    currentLedger: null,
    billType: 'expense',
    amountStr: '',
    // 币种
    currencies: currencies.getAllCurrencies(),
    selectedCurrency: 'CNY',
    currencySymbol: '¥',
    exchangeRate: 1,
    amountCNYText: '0.00',
    // 分类
    categoryList: [],
    selectedCategory: '',
    // 人员
    members: [],
    selectedPayer: 'self',
    showAddMemberModal: false,
    newMemberName: '',
    // 分摊
    splitMode: 'equal',
    splitItems: [],
    splitPerPerson: '0.00',
    splitRemainder: 0,
    ratioTotal: 0,
    totalAmountFen: 0,
    // 备注
    note: '',
    showNoteModal: false,
    // 日期
    billDate: 0,
    billDateStr: '',
    dateText: '今天',
    // 账户
    accounts: [],
    selectedAccount: 'wechat',
    accountName: '微信支付',
    showAccountPicker: false,
  },

  onLoad() {
    ledger.initDefaultLedger()
    const now = new Date()
    this.setData({
      billDate: now.getTime(),
      billDateStr: util.formatDate(now),
      dateText: '今天',
      categoryList: categories.getCategories('expense'),
      accounts: storage.getAccounts(),
      selectedAccount: storage.getSettings().defaultAccount || 'wechat',
    })
    this.updateAccountName()
  },

  onShow() {
    const members = storage.getMembers()
    const current = ledger.getCurrentLedger()
    this.setData({ members, currentLedger: current, accounts: storage.getAccounts() })
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

  // ========== 币种 ==========
  selectCurrency(e) {
    const code = e.currentTarget.dataset.code
    const info = currencies.getCurrency(code)
    this.setData({
      selectedCurrency: code,
      currencySymbol: info.symbol,
      exchangeRate: info.rate
    })
    this.updateAmountCNY()
    if (this.data.splitMode === 'equal') this.calcEqualSplit()
  },

  updateAmountCNY() {
    const amountFen = util.yuanToFen(parseFloat(this.data.amountStr) || 0)
    const amountCNY = currencies.toCNY(amountFen, this.data.selectedCurrency, this.data.exchangeRate)
    this.setData({ amountCNYText: (amountCNY / 100).toFixed(2), totalAmountFen: amountCNY })
  },

  // ========== 分类 ==========
  selectCategory(e) {
    this.setData({ selectedCategory: e.currentTarget.dataset.key })
  },

  // ========== 花费人 ==========
  pickPayer(e) {
    this.setData({ selectedPayer: e.currentTarget.dataset.id })
  },

  // ========== 分摊 ==========
  initSplitItems(members) {
    const items = (members || []).map(m => ({
      memberId: m.id, name: m.name, avatar: m.avatar, amount: 0, inputStr: ''
    }))
    this.setData({ splitItems: items })
  },

  setSplitNoSplit() { this.setData({ splitMode: 'no_split' }) },
  setSplitEqual() { this.setData({ splitMode: 'equal' }); this.calcEqualSplit() },
  setSplitRatio() { this.setData({ splitMode: 'ratio' }) },
  setSplitCustom() { this.setData({ splitMode: 'custom' }) },

  calcEqualSplit() {
    const amountFen = util.yuanToFen(parseFloat(this.data.amountStr) || 0)
    const count = this.data.splitItems.length || 1
    const perPerson = Math.floor(amountFen / count)
    this.setData({
      splitPerPerson: (perPerson / 100).toFixed(2),
      splitRemainder: amountFen - perPerson * count,
      totalAmountFen: amountFen
    })
  },

  onSplitAmountInput(e) {
    const idx = e.currentTarget.dataset.idx
    const val = e.detail.value
    const items = [...this.data.splitItems]
    items[idx].inputStr = val
    items[idx].amount = util.yuanToFen(parseFloat(val) || 0)
    const amountFen = util.yuanToFen(parseFloat(this.data.amountStr) || 0)
    const totalInput = items.reduce((s, i) => s + i.amount, 0)
    this.setData({
      splitItems: items,
      ratioTotal: totalInput,
      totalAmountFen: amountFen,
      splitRemainder: this.data.splitMode === 'custom' ? amountFen - totalInput : 0
    })
  },

  // ========== 备注 ==========
  focusNote() { this.setData({ showNoteModal: true }) },
  closeNote() { this.setData({ showNoteModal: false }) },
  onNoteInput(e) { this.setData({ note: e.detail.value }) },

  // ========== 日期 ==========
  pickDate() {
    // 触发隐藏的 date picker
    this.setData({ showDatePicker: true })
    // 使用 wx 内置
    const that = this
    wx.showModal({ // fallback: 用简单的日期选择
      title: '选择日期',
      editable: true,
      placeholderText: 'YYYY-MM-DD',
      content: that.data.billDateStr,
      success(res) {
        if (res.confirm && res.content) {
          const d = new Date(res.content)
          if (!isNaN(d.getTime())) {
            const today = new Date()
            const isToday = d.toDateString() === today.toDateString()
            that.setData({
              billDate: d.getTime(),
              billDateStr: res.content,
              dateText: isToday ? '今天' : res.content
            })
          }
        }
      }
    })
  },
  onDateChange(e) {
    const val = e.detail.value
    const d = new Date(val)
    const today = new Date()
    const isToday = d.toDateString() === today.toDateString()
    this.setData({
      billDate: d.getTime(),
      billDateStr: val,
      dateText: isToday ? '今天' : val
    })
  },

  // ========== 账户 ==========
  pickAccount() { this.setData({ showAccountPicker: true }) },
  closeAccountPicker() { this.setData({ showAccountPicker: false }) },
  selectAccount(e) {
    const key = e.currentTarget.dataset.key
    this.setData({ selectedAccount: key, showAccountPicker: false })
    this.updateAccountName()
  },
  updateAccountName() {
    const acc = this.data.accounts.find(a => a.key === this.data.selectedAccount)
    this.setData({ accountName: acc ? acc.name : '未知' })
  },

  // ========== 键盘 ==========
  pressKey(e) {
    const val = e.currentTarget.dataset.val

    if (val === 'del') {
      let str = this.data.amountStr
      this.setData({ amountStr: str ? str.slice(0, -1) : '' })
      this.afterAmountChange()
      return
    }

    if (val === 'ok') return this.submitBill()

    let str = this.data.amountStr

    // 00 保护：小数点后已有数字时不追加00，且总长度检查
    if (val === '00') {
      if (str.includes('.') && str.split('.')[1].length > 0) return
      if (str.length >= 9) return  // 00 后可能超 10 位
    }

    // 小数点保护
    if (val === '.' && str.includes('.')) return

    // 小数位数保护（不包含 +- 运算符场景）
    if (str.includes('.') && !['+', '-'].some(op => str.includes(op))) {
      if (str.split('.')[1].length >= 2) return
    }

    // 总长度保护
    if (str.length >= 10) return

    str += val
    this.setData({ amountStr: str })
    this.afterAmountChange()
  },

  afterAmountChange() {
    this.updateAmountCNY()
    if (this.data.splitMode === 'equal') this.calcEqualSplit()
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

    const amountFen = util.yuanToFen(amountResult.value)
    const amountCNY = currencies.toCNY(amountFen, this.data.selectedCurrency, this.data.exchangeRate)

    const bill = {
      amount: amountFen,
      amountCNY: amountCNY,
      currency: this.data.selectedCurrency,
      exchangeRate: this.data.exchangeRate,
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
      const delta = bill.type === 'income' ? amountCNY : -amountCNY
      storage.updateAccountBalance(bill.account, delta)
    }

    this.setData({ amountStr: '', selectedCategory: '', note: '' })
    const sym = this.data.currencySymbol
    wx.showToast({ title: `${bill.type === 'income' ? '收入' : '支出'} ${sym}${amountResult.value.toFixed(2)}`, icon: 'success', duration: 1200 })
  },

  buildSplits() {
    if (this.data.billType !== 'expense' || this.data.members.length <= 1) return null
    if (this.data.splitMode === 'no_split' || this.data.splitMode === 'equal') return null
    const amountFen = util.yuanToFen(parseFloat(this.data.amountStr) || 0)
    const ratioTotal = this.data.ratioTotal
    if (ratioTotal <= 0) return null
    return this.data.splitItems
      .filter(i => i.amount > 0)
      .map(i => ({
        memberId: i.memberId,
        amount: this.data.splitMode === 'ratio'
          ? Math.round(i.amount / ratioTotal * amountFen)
          : i.amount
      }))
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
    const splitItems = [...this.data.splitItems, { memberId: newM.id, name: newM.name, avatar: newM.avatar, amount: 0, inputStr: '' }]
    this.setData({ members, showAddMemberModal: false, splitItems })
    if (this.data.splitMode === 'equal') this.calcEqualSplit()
  },
})
