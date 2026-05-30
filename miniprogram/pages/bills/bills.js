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
    hasBills: false
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

    let bills = storage.getBillsByMonth(currentYear, currentMonth)

    // 类型筛选
    if (filterType !== 'all') {
      bills = bills.filter(b => b.type === filterType)
    }

    // 搜索
    if (searchKeyword) {
      const kw = searchKeyword.toLowerCase()
      bills = bills.filter(b =>
        (b.note && b.note.toLowerCase().includes(kw)) ||
        b.category.includes(kw)
      )
    }

    // 统计
    let monthIncome = 0, monthExpense = 0
    const allMonthBills = storage.getBillsByMonth(currentYear, currentMonth)
    allMonthBills.forEach(b => {
      if (b.type === 'income') monthIncome += b.amount
      else monthExpense += b.amount
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

  // 搜索
  onSearchInput(e) {
    this.setData({
      searchKeyword: e.detail.value.trim(),
      searching: e.detail.value.trim().length > 0
    })
    this.loadBills()
  },

  clearSearch() {
    this.setData({ searchKeyword: '', searching: false })
    this.loadBills()
  },

  // 删除账单
  deleteBill(e) {
    const billId = e.currentTarget.dataset.id
    wx.showModal({
      title: '删除账单',
      content: '确定删除这条记录？删除后不可恢复。',
      success: (res) => {
        if (res.confirm) {
          storage.deleteBill(billId)
          this.loadBills()
          wx.showToast({ title: '已删除', icon: 'success' })
        }
      }
    })
  }
})
