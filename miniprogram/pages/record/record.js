// pages/record/record.js — 记账页（全平铺版）

const util = require('../../utils/util')
const storage = require('../../utils/storage')
const validator = require('../../utils/validator')
const categories = require('../../data/categories')
const currencies = require('../../data/currencies')
const ledger = require('../../utils/ledger')
const cloudSync = require('../../utils/cloud-sync')

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
    rateDisplay: '',
    // 分类
    categoryList: [],
    selectedCategory: '',
    topCategories: [],
    moreCategories: [],
    showMoreCategories: false,
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
    this.splitCategories()
  },

  onShow() {
    const members = storage.getMembers()
    const current = ledger.getCurrentLedger()
    this.setData({ members, currentLedger: current, accounts: storage.getAccounts() })
    this.initSplitItems(members)
  },

  splitCategories() {
    const list = this.data.categoryList
    this.setData({
      topCategories: list.slice(0, 7),
      moreCategories: list.slice(7)
    })
  },

  toggleMoreCategories() {
    this.setData({ showMoreCategories: !this.data.showMoreCategories })
  },

  // ========== 收支切换 ==========
  switchType(e) {
    const type = e.currentTarget.dataset.type
    const categoryList = categories.getCategories(type)
    this.setData({
      billType: type, categoryList, selectedCategory: '', showMoreCategories: false
    })
    this.splitCategories()
  },

  // ========== 币种 ==========
  selectCurrency(e) {
    const code = e.currentTarget.dataset.code
    const info = currencies.getCurrency(code)
    this.setData({
      selectedCurrency: code,
      currencySymbol: info.symbol,
      exchangeRate: info.rate,
      rateDisplay: currencies.getRateDisplay(code)
    })
    this.afterAmountChange()
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
    // 触发隐藏的 picker
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

    // 00 保护
    if (val === '00') {
      if (str.includes('.') && str.split('.')[1].length > 0) return
      if (str.length >= 9) return
    }

    // 小数点保护
    if (val === '.' && str.includes('.')) return

    // 运算符保护：不能连续，不能开头
    if (val === '+' || val === '-') {
      if (str.length === 0) return
      const last = str[str.length - 1]
      if (last === '+' || last === '-' || last === '.') return
      if (str.length >= 12) return
      str += val
      this.setData({ amountStr: str })
      return
    }

    // 小数位数保护（取最后一个运算符之后的部分检查）
    const lastSegment = str.split(/[+\-]/).pop()
    if (lastSegment.includes('.') && lastSegment.split('.')[1].length >= 2) return

    // 总长度保护
    if (str.length >= 12) return

    str += val
    this.setData({ amountStr: str })
    this.afterAmountChange()
  },

  afterAmountChange() {
    // 如果有运算符，计算表达式结果
    const str = this.data.amountStr
    let computed = str
    if (/[+\-]/.test(str.slice(1))) {
      try {
        // 安全计算：逐步解析加法表达式
        computed = this._safeEval(str)
        if (isNaN(computed) || !isFinite(computed)) computed = 0
      } catch (e) { computed = 0 }
    }
    const amountFen = util.yuanToFen(parseFloat(computed) || 0)
    const amountCNY = currencies.toCNY(amountFen, this.data.selectedCurrency, this.data.exchangeRate)
    this.setData({ amountCNYText: (amountCNY / 100).toFixed(2), totalAmountFen: amountFen })
    if (this.data.splitMode === 'equal') this.calcEqualSplit()
  },

  // ========== 提交 ==========
  submitBill() {
    let amountStr = this.data.amountStr
    if (!amountStr) { wx.showToast({ title: '请输入金额', icon: 'none' }); return }

    // 如果有运算符，先计算
    if (/[+\-]/.test(amountStr.slice(1))) {
      try {
        const computed = this._safeEval(amountStr)
        if (!isNaN(computed) && isFinite(computed)) amountStr = String(computed)
      } catch (e) {}
    }

    if (parseFloat(amountStr) <= 0) {
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
      // 共享账本也更新本地账户余额
      const delta = bill.type === 'income' ? amountCNY : -amountCNY
      storage.updateAccountBalance(bill.account, delta)
    } else {
      const record = storage.addBill(bill)
      bill.id = record.id
      const delta = bill.type === 'income' ? amountCNY : -amountCNY
      storage.updateAccountBalance(bill.account, delta)
      // 推送云端
      cloudSync.pushBill(bill)
    }

    // 预算超支检查
    if (bill.type === 'expense') {
      const budget = storage.getBudget()
      if (budget.enabled && budget.amount > 0) {
        const now = new Date()
        const monthStats = storage.getMonthStats(now.getFullYear(), now.getMonth() + 1)
        const percent = Math.round(monthStats.totalExpense / budget.amount * 100)
        if (percent >= budget.alertAt) {
          wx.showModal({
            title: '⚠️ 预算提醒',
            content: `本月已支出 ¥${(monthStats.totalExpense / 100).toFixed(2)}，占预算的 ${percent}%（预算 ¥${(budget.amount / 100).toFixed(0)}）`,
            showCancel: false,
            confirmText: '知道了'
          })
        }
      }
    }

    this.setData({
      amountStr: '',
      selectedCategory: '',
      note: '',
      splitMode: 'no_split',
      splitMembers: []
    })
    const sym = this.data.currencySymbol
    wx.showToast({ title: `${bill.type === 'income' ? '收入' : '支出'} ${sym}${amountResult.value.toFixed(2)}`, icon: 'success', duration: 1200 })
  },

  /**
   * 安全计算加法表达式（替代 Function/eval）
   * 支持格式: "3.5+1.2-0.7" 或 "100"
   */
  _safeEval(expr) {
    try {
      // 只保留数字、小数点、+、-
      const sanitized = expr.replace(/[^0-9.+-]/g, '')
      // 防御连续运算符：把 ++/+-/-+/-- 替换为最后一个
      const normalized = sanitized.replace(/[+-]{2,}/g, m => m[m.length - 1])
      // 用正则分割成 [符号+数字, ...]
      const tokens = normalized.match(/[+-]?[\d.]+/g)
      if (!tokens) return 0
      let result = 0
      for (const t of tokens) {
        const n = parseFloat(t)
        if (!isNaN(n) && isFinite(n)) result += n
      }
      return result
    } catch (e) { return 0 }
  },

  buildSplits() {
    if (this.data.billType !== 'expense' || this.data.members.length <= 1) return null
    if (this.data.splitMode === 'no_split') return null
    const amountFen = util.yuanToFen(parseFloat(this.data.amountStr) || 0)
    if (amountFen <= 0) return null

    // 均摊模式：计算每人份额
    if (this.data.splitMode === 'equal') {
      const count = this.data.splitItems.length || 1
      const perPerson = Math.floor(amountFen / count)
      const remainder = amountFen - perPerson * count
      return this.data.splitItems.map((item, idx) => ({
        memberId: item.memberId,
        amount: perPerson + (idx < remainder ? 1 : 0)
      }))
    }

    // 比例/自定义模式
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
