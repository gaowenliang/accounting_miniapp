// pages/bills/bills.js — 账单明细

const util = require('../../utils/util')
const storage = require('../../utils/storage')
const categories = require('../../data/categories')

Page({
  data: {
    loading: true,
    // 月份
    currentYear: 0,
    currentMonth: 0,
    monthLabel: '',
    monthIncome: 0,
    monthExpense: 0,
    // 筛选
    filterType: 'all',  // 'all' | 'income' | 'expense'
    searchKeyword: '',
    searching: false,
    // 账单列表（按日期分组）
    groupedBills: [],
    hasBills: false,
    // 防抖定时器
    _searchTimer: null,
    // 编辑
    showEditModal: false,
    editingBillId: '',
    editAmount: '',
    editCategory: '',
    editNote: '',
    editCategories: []
  },

  onLoad() {
    const now = new Date()
    this.setData({
      currentYear: now.getFullYear(),
      currentMonth: now.getMonth() + 1  // 1-indexed
    })
  },

  onShow() {
    this.loadBills()
  },

  loadBills() {
    const { currentYear, currentMonth, filterType, searchKeyword } = this.data
    this.setData({ monthLabel: `${currentYear}年${currentMonth}月` })

    // 一次取出全月数据
    const allMonthBills = storage.getBillsByMonth(currentYear, currentMonth)

    // 类型筛选 + 搜索
    let bills = allMonthBills
    if (filterType !== 'all') {
      bills = bills.filter(b => b.type === filterType)
    }
    if (searchKeyword) {
      const kw = searchKeyword.toLowerCase()
      const kwNum = parseFloat(searchKeyword)  // 支持按金额搜索
      bills = bills.filter(b =>
        (b.note && b.note.toLowerCase().includes(kw)) ||
        b.category.includes(kw) ||
        (kwNum > 0 && Math.abs((b.amountCNY || b.amount) / 100 - kwNum) < 0.005) ||
        (kwNum > 0 && String((b.amountCNY || b.amount) / 100).includes(searchKeyword))
      )
    }

    // 统计（基于全月数据）
    let monthIncome = 0, monthExpense = 0
    allMonthBills.forEach(b => {
      if (b.type === 'income') monthIncome += (b.amountCNY || b.amount)
      else monthExpense += (b.amountCNY || b.amount)
    })

    // 按日期分组
    const groups = {}
    bills.forEach(b => {
      const dateStr = util.formatDate(b.date)
      if (!groups[dateStr]) {
        groups[dateStr] = {
          date: dateStr,
          dateLabel: this.getDateLabel(b.date),
          bills: [],
          dayIncome: 0,
          dayExpense: 0
        }
      }
      const cat = categories.getCategoryBy(b.category, b.type)
      const members = storage.getMembers()
      const payer = members.find(m => m.id === (b.payer || 'self'))
      groups[dateStr].bills.push({
        ...b,
        categoryName: cat.name,
        categoryIcon: cat.icon,
        amountText: util.formatMoney(b.amount),
        amountCNYText: b.amountCNY ? ((b.amountCNY / 100).toFixed(2)) : '',
        payerName: payer ? payer.name : '我'
      })
      if (b.type === 'income') groups[dateStr].dayIncome += b.amount
      else groups[dateStr].dayExpense += b.amount
    })

    const groupedBills = Object.values(groups).sort((a, b) => b.date.localeCompare(a.date))

    this.setData({
      loading: false,
      groupedBills,
      monthIncome,
      monthExpense,
      hasBills: allMonthBills.length > 0
    })
  },

  getDateLabel(timestamp) {
    const today = util.todayStart()
    const target = new Date(timestamp)
    const targetStart = new Date(target.getFullYear(), target.getMonth(), target.getDate()).getTime()
    if (targetStart === today) return '今天'
    if (targetStart === today - 86400000) return '昨天'
    return `${target.getMonth() + 1}月${target.getDate()}日`
  },

  // 月份切换
  prevMonth() {
    let { currentYear, currentMonth } = this.data
    currentMonth--
    if (currentMonth < 1) { currentMonth = 12; currentYear-- }
    this.setData({ currentYear, currentMonth }, () => this.loadBills())
  },

  nextMonth() {
    let { currentYear, currentMonth } = this.data
    const now = new Date()
    if (currentYear === now.getFullYear() && currentMonth === now.getMonth() + 1) return
    currentMonth++
    if (currentMonth > 12) { currentMonth = 1; currentYear++ }
    this.setData({ currentYear, currentMonth }, () => this.loadBills())
  },

  // 筛选
  switchFilter(e) {
    this.setData({ filterType: e.currentTarget.dataset.type })
    this.loadBills()
  },

  // 搜索（防抖 300ms）
  onSearchInput(e) {
    const val = e.detail.value.trim()
    this.setData({ searchKeyword: val, searching: val.length > 0 })
    if (this._searchTimer) clearTimeout(this._searchTimer)
    this._searchTimer = setTimeout(() => this.loadBills(), 300)
  },

  clearSearch() {
    this.setData({ searchKeyword: '', searching: false })
    this.loadBills()
  },

  // 删除账单
  deleteBill(e) {
    const billId = e.currentTarget.dataset.id
    const bill = storage.getBills().find(b => b.id === billId)
    if (!bill) return
    wx.showModal({
      title: '删除账单',
      content: '确定删除这条记录？删除后不可恢复。',
      success: (res) => {
        if (res.confirm) {
          // 回退账户余额
          const delta = bill.type === 'income'
            ? -(bill.amountCNY || bill.amount)
            : (bill.amountCNY || bill.amount)
          storage.updateAccountBalance(bill.account, delta)
          storage.deleteBill(billId)
          this.loadBills()
          wx.showToast({ title: '已删除', icon: 'success' })
        }
      }
    })
  },

  // ========== 编辑账单 ==========

  editBill(e) {
    const billId = e.currentTarget.dataset.id
    const bill = storage.getBills().find(b => b.id === billId)
    if (!bill) return
    this.setData({
      showEditModal: true,
      editingBillId: billId,
      editAmount: (bill.amount / 100).toFixed(2),
      editCategory: bill.category,
      editNote: bill.note || '',
      editCategories: categories.getCategories(bill.type)
    })
  },

  onEditAmount(e) { this.setData({ editAmount: e.detail.value }) },
  onEditNote(e) { this.setData({ editNote: e.detail.value }) },

  selectEditCategory(e) {
    this.setData({ editCategory: e.currentTarget.dataset.key })
  },

  cancelEdit() { this.setData({ showEditModal: false }) },

  confirmEdit() {
    const { editingBillId, editAmount, editCategory, editNote } = this.data
    const amount = parseFloat(editAmount)
    if (!amount || amount <= 0) {
      wx.showToast({ title: '请输入有效金额', icon: 'none' }); return
    }
    if (!editCategory) {
      wx.showToast({ title: '请选择分类', icon: 'none' }); return
    }

    // 计算金额差异，更新账户余额
    const oldBill = storage.getBills().find(b => b.id === editingBillId)
    if (oldBill) {
      const oldAmountCNY = oldBill.amountCNY || oldBill.amount
      const newAmountFen = Math.round(amount * 100)
      const newAmountCNY = oldBill.currency && oldBill.currency !== 'CNY'
        ? Math.round(newAmountFen * (oldBill.exchangeRate || 1))
        : newAmountFen
      const oldDelta = oldBill.type === 'income' ? -oldAmountCNY : oldAmountCNY
      const newDelta = oldBill.type === 'income' ? newAmountCNY : -newAmountCNY
      storage.updateAccountBalance(oldBill.account, oldDelta + newDelta)
    }

    storage.updateBill(editingBillId, {
      amount: Math.round(amount * 100),
      category: editCategory,
      note: editNote.trim()
    })

    this.setData({ showEditModal: false })
    this.loadBills()
    wx.showToast({ title: '已保存', icon: 'success' })
  }
})
