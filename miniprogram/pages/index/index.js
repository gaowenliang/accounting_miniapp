// pages/index/index.js — 首页：本月概览 + 快捷入口

const util = require('../../utils/util')
const storage = require('../../utils/storage')
const categories = require('../../data/categories')

Page({
  data: {
    loading: true,
    // 月度统计
    currentMonth: '',
    totalIncome: 0,
    totalExpense: 0,
    balance: 0,
    incomeChange: '',
    expenseChange: '',
    // 预算
    budgetEnabled: false,
    budgetAmount: 0,
    budgetUsed: 0,
    budgetPercent: 0,
    // 最近账单
    recentBills: [],
    hasBills: false,
    // 时间
    _lastLoadTime: 0
  },

  onShow() {
    const now = Date.now()
    if (now - this.data._lastLoadTime < 300) return
    this.setData({ _lastLoadTime: now, loading: true })
    this.loadData()
  },

  loadData() {
    const now = new Date()
    const year = now.getFullYear()
    const month = now.getMonth()
    this.setData({ currentMonth: `${year}年${month + 1}月` })

    // 月度统计
    const stats = storage.getMonthStats(year, month)
    // 上月对比
    const prevMonth = month === 0 ? 11 : month - 1
    const prevYear = month === 0 ? year - 1 : year
    const prevStats = storage.getMonthStats(prevYear, prevMonth)

    const incomeChange = prevStats.totalIncome > 0
      ? Math.round((stats.totalIncome - prevStats.totalIncome) / prevStats.totalIncome * 100)
      : 0
    const expenseChange = prevStats.totalExpense > 0
      ? Math.round((stats.totalExpense - prevStats.totalExpense) / prevStats.totalExpense * 100)
      : 0

    // 预算
    const budget = storage.getBudget()

    // 最近账单（10条）
    const allBills = storage.getBills()
    const recentBills = allBills.slice(0, 10).map(b => {
      const cat = categories.getCategoryBy(b.category, b.type)
      return {
        ...b,
        categoryName: cat.name,
        categoryIcon: cat.icon,
        amountText: util.formatMoney(b.amount),
        dateText: util.isSameDay(b.date, Date.now()) ? '今天 ' + util.formatTime(b.date)
               : util.isSameDay(b.date, Date.now() - 86400000) ? '昨天'
               : util.formatDate(b.date)
      }
    })

    this.setData({
      loading: false,
      totalIncome: stats.totalIncome,
      totalExpense: stats.totalExpense,
      balance: stats.balance,
      incomeChange: incomeChange >= 0 ? `+${incomeChange}%` : `${incomeChange}%`,
      expenseChange: expenseChange >= 0 ? `+${expenseChange}%` : `${expenseChange}%`,
      budgetEnabled: budget.enabled,
      budgetAmount: budget.amount,
      budgetUsed: stats.totalExpense,
      budgetPercent: budget.amount > 0 ? Math.min(100, Math.round(stats.totalExpense / budget.amount * 100)) : 0,
      recentBills,
      hasBills: allBills.length > 0
    })
  },

  goAddBill() {
    wx.switchTab({ url: '/pages/add-bill/add-bill' })
  },

  goBills() {
    wx.switchTab({ url: '/pages/bills/bills' })
  },

  goStats() {
    wx.switchTab({ url: '/pages/stats/stats' })
  },

  onPullDownRefresh() {
    this.loadData()
    wx.stopPullDownRefresh()
  },

  onShareAppMessage() {
    const count = storage.getBills().length
    return {
      title: count === 0 ? '开始你的记账之旅' : `我已经记了${count}笔账了`,
      path: '/pages/index/index'
    }
  }
})
