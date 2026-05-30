// pages/stats/stats.js — 统计分析

const util = require('../../utils/util')
const storage = require('../../utils/storage')
const categories = require('../../data/categories')

Page({
  data: {
    loading: true,
    // 模式
    mode: 'month',  // 'month' | 'year'
    currentYear: 0,
    currentMonth: 0,
    periodLabel: '',
    // 收支
    totalIncome: 0,
    totalExpense: 0,
    balance: 0,
    // 支出分类排名
    categoryRank: [],
    // 月度趋势
    monthlyTrend: [],
    // 每日趋势
    dailyTrend: []
  },

  onLoad() {
    const now = new Date()
    this.setData({
      currentYear: now.getFullYear(),
      currentMonth: now.getMonth()
    })
  },

  onShow() {
    this.loadStats()
  },

  loadStats() {
    this.setData({ loading: true })

    if (this.data.mode === 'month') {
      this.loadMonthStats()
    } else {
      this.loadYearStats()
    }
  },

  loadMonthStats() {
    const { currentYear, currentMonth } = this.data
    this.setData({ periodLabel: `${currentYear}年${currentMonth + 1}月` })

    const stats = storage.getMonthStats(currentYear, currentMonth)

    // 分类排名
    const categoryRank = Object.entries(stats.categoryStats)
      .map(([key, data]) => {
        const cat = categories.getCategoryBy(key, 'expense')
        return {
          key,
          name: cat.name,
          icon: cat.icon,
          color: cat.color,
          amount: data.amount,
          count: data.count,
          percent: stats.totalExpense > 0 ? Math.round(data.amount / stats.totalExpense * 100) : 0
        }
      })
      .sort((a, b) => b.amount - a.amount)

    // 每日趋势（近30天）
    const dailyTrend = []
    for (let i = 29; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000)
      const dayBills = storage.getBillsByDay(d.getTime())
      const dayExpense = dayBills.filter(b => b.type === 'expense').reduce((s, b) => s + b.amount, 0)
      dailyTrend.push({
        date: `${d.getMonth() + 1}/${d.getDate()}`,
        expense: dayExpense
      })
    }

    this.setData({
      loading: false,
      totalIncome: stats.totalIncome,
      totalExpense: stats.totalExpense,
      balance: stats.balance,
      categoryRank,
      dailyTrend,
      monthlyTrend: []
    })
  },

  loadYearStats() {
    const { currentYear } = this.data
    this.setData({ periodLabel: `${currentYear}年` })

    const stats = storage.getYearStats(currentYear)

    // 月度趋势
    const monthlyTrend = stats.monthlyData.map(m => ({
      ...m,
      label: `${m.month}月`
    }))

    this.setData({
      loading: false,
      totalIncome: stats.totalIncome,
      totalExpense: stats.totalExpense,
      balance: stats.balance,
      categoryRank: [],
      dailyTrend: [],
      monthlyTrend
    })
  },

  // 切换模式
  switchMode(e) {
    this.setData({ mode: e.currentTarget.dataset.mode })
    this.loadStats()
  },

  // 月份切换
  prevPeriod() {
    let { currentYear, currentMonth, mode } = this.data
    if (mode === 'month') {
      currentMonth--
      if (currentMonth < 0) { currentMonth = 11; currentYear-- }
    } else {
      currentYear--
    }
    this.setData({ currentYear, currentMonth }, () => this.loadStats())
  },

  nextPeriod() {
    let { currentYear, currentMonth, mode } = this.data
    const now = new Date()
    if (mode === 'month') {
      if (currentYear === now.getFullYear() && currentMonth === now.getMonth()) return
      currentMonth++
      if (currentMonth > 11) { currentMonth = 0; currentYear++ }
    } else {
      if (currentYear >= now.getFullYear()) return
      currentYear++
    }
    this.setData({ currentYear, currentMonth }, () => this.loadStats())
  }
})
