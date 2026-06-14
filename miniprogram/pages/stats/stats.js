// pages/stats/stats.js — 统计分析（月度 + 年度 + 按人 + AA结算）

const storage = require('../../utils/storage')
const util = require('../../utils/util')

Page({
  data: {
    // 模式：monthly / yearly / person / aa
    mode: 'monthly',
    // 月份导航
    currentYear: 2026,
    currentMonth: 5,
    // 月度数据
    monthExpense: 0,
    monthIncome: 0,
    monthBalance: 0,
    categoryRanking: [],
    dailyTrend: [],
    // 年度数据
    yearlyExpense: 0,
    yearlyIncome: 0,
    monthlyData: [],
    // 按人数据
    personStats: [],
    expandedPerson: null,
    // AA结算
    aaResult: null,
    aaParticipants: [],
    aaAllSelected: true,
    // 月度子维度：category / currency / account
    subMode: 'category',
    currencyStats: { list: [], totalCNY: 0 },
    accountStats: { list: [], totalCNY: 0 },
    // 分类排行图表
    chartType: 'donut',  // donut / list
    categoryTotal: 0,
  },

  onLoad() {
    const now = new Date()
    this.setData({
      currentYear: now.getFullYear(),
      currentMonth: now.getMonth() + 1
    })
  },

  onShow() {
    this.refresh()
  },

  refresh() {
    const { mode, currentYear, currentMonth } = this.data
    switch (mode) {
      case 'monthly': this.loadMonthly(); break
      case 'yearly': this.loadYearly(); break
      case 'person': this.loadPersonStats(); break
      case 'aa': this.loadAA(); break
    }
  },

  // ========== 模式切换 ==========

  switchMode(e) {
    this.setData({ mode: e.currentTarget.dataset.mode, subMode: 'category' })
    this.refresh()
  },

  switchSubMode(e) {
    this.setData({ subMode: e.currentTarget.dataset.mode })
    this.loadMonthly()
  },

  switchChart(e) {
    this.setData({ chartType: e.currentTarget.dataset.type })
  },

  // ========== 月份/年份导航 ==========

  prevMonth() {
    let { currentYear, currentMonth } = this.data
    currentMonth--
    if (currentMonth < 1) { currentMonth = 12; currentYear-- }
    this.setData({ currentYear, currentMonth })
    this.refresh()
  },

  nextMonth() {
    let { currentYear, currentMonth } = this.data
    currentMonth++
    if (currentMonth > 12) { currentMonth = 1; currentYear++ }
    this.setData({ currentYear, currentMonth })
    this.refresh()
  },

  prevYear() {
    this.setData({ currentYear: this.data.currentYear - 1 })
    this.refresh()
  },

  nextYear() {
    this.setData({ currentYear: this.data.currentYear + 1 })
    this.refresh()
  },

  // ========== 月度统计 ==========

  loadMonthly() {
    const { currentYear, currentMonth, subMode } = this.data
    const stats = storage.getMonthStats(currentYear, currentMonth)

    // 基础数据（分类维度始终加载）
    const CHART_COLORS = ['#00C4B8', '#8B5CF6', '#3B82F6', '#FFAD60', '#EF4444', '#6366F1', '#F59E0B', '#10B981', '#EC4899', '#6B7280']
    const ranking = storage.getCategoryRanking(currentYear, currentMonth)

    // 统计每个分类的笔数
    const bills = storage.getActiveBillsByMonth(currentYear, currentMonth)
    const expenseBills = bills.filter(b => b.type === 'expense')
    const catCountMap = {}
    expenseBills.forEach(b => {
      if (!catCountMap[b.category]) catCountMap[b.category] = 0
      catCountMap[b.category]++
    })

    ranking.forEach((item, i) => {
      item.color = CHART_COLORS[i % CHART_COLORS.length]
      item.amountStr = (item.amount / 100).toFixed(2)
      item.count = catCountMap[item.key] || 0
    })

    const categoryTotal = ranking.reduce((s, r) => s + (r.amount || 0), 0)

    const trend = storage.getDailyTrend(currentYear, currentMonth)

    const updateData = {
      monthExpense: stats.totalExpense,
      monthIncome: stats.totalIncome,
      monthBalance: stats.totalIncome - stats.totalExpense,
      categoryRanking: ranking,
      categoryTotal,
      dailyTrend: trend
    }

    // 按子维度加载额外数据
    if (subMode === 'currency') {
      const currencyStats = storage.getCurrencyStats(currentYear, currentMonth)
      currencyStats.list.forEach(item => {
        if (item.code === 'CNY') {
          item.rateDisplay = ''
        } else {
          item.rateDisplay = '预设:' + item.rate
        }
      })
      updateData.currencyStats = currencyStats
    } else if (subMode === 'account') {
      updateData.accountStats = storage.getAccountStats(currentYear, currentMonth)
    }

    this.setData(updateData)
  },

  // ========== 年度统计 ==========

  loadYearly() {
    const { currentYear } = this.data
    // 一次拉全年数据，避免循环 12 次
    const yearStart = util.monthStart(currentYear, 1)
    const yearEnd = util.monthEnd(currentYear, 12)
    const allBills = storage.getActiveBills().filter(b => b.date >= yearStart && b.date <= yearEnd)

    let totalExpense = 0, totalIncome = 0
    const monthlyData = []
    for (let m = 1; m <= 12; m++) {
      const ms = util.monthStart(currentYear, m)
      const me = util.monthEnd(currentYear, m)
      const monthBills = allBills.filter(b => b.date >= ms && b.date <= me)
      let income = 0, expense = 0
      monthBills.forEach(b => {
        const amt = b.amountCNY || b.amount
        if (b.type === 'income') income += amt
        else expense += amt
      })
      totalIncome += income
      totalExpense += expense
      monthlyData.push({ month: m, expense, income })
    }

    this.setData({
      yearlyExpense: totalExpense,
      yearlyIncome: totalIncome,
      monthlyData
    })
  },

  // ========== 按人统计 ==========

  loadPersonStats() {
    const { currentYear, currentMonth } = this.data
    const stats = storage.getPersonStats(currentYear, currentMonth)
    // 给每人加账单明细
    const bills = storage.getActiveBillsByMonth(currentYear, currentMonth)
    const categories = require('../../data/categories')
    stats.forEach(person => {
      const personBills = bills
        .filter(b => (b.payer || 'self') === person.id)
        .sort((a, b) => (b.date || b.createdAt || 0) - (a.date || a.createdAt || 0))
        .slice(0, 20) // 最多显示20条
        .map(b => {
          const cat = categories.getCategoryBy(b.category, b.type)
          return {
            id: b.id || Math.random(),
            icon: cat.icon,
            catName: cat.name,
            note: b.note,
            type: b.type,
            amountDisplay: b.amountCNY || b.amount,
            dateStr: (b.date ? new Date(b.date) : new Date()).getDate() + '日'
          }
        })
      person.bills = personBills
    })
    this.setData({ personStats: stats, expandedPerson: null })
  },

  togglePersonDetail(e) {
    const id = e.currentTarget.dataset.id
    this.setData({ expandedPerson: this.data.expandedPerson === id ? null : id })
  },

  // ========== AA结算 ==========

  loadAA() {
    const { currentYear, currentMonth } = this.data
    const members = storage.getActiveMembers()
    const result = storage.getAAResult(currentYear, currentMonth)
    this.setData({
      aaResult: result,
      aaParticipants: members.map(m => ({
        ...m,
        selected: true,
        paid: (result.paid || {})[m.id] || 0,
        balance: (result.balance || {})[m.id] || 0
      }))
    })
  },

  // 切换AA参与人
  toggleAAParticipant(e) {
    const id = e.currentTarget.dataset.id
    const participants = this.data.aaParticipants.map(p => {
      if (p.id === id) p.selected = !p.selected
      return p
    })
    this.setData({ aaParticipants: participants })
    this.recalcAA()
  },

  toggleAAAll() {
    const allSelected = !this.data.aaAllSelected
    const participants = this.data.aaParticipants.map(p => ({ ...p, selected: allSelected }))
    this.setData({ aaParticipants: participants, aaAllSelected: allSelected })
    this.recalcAA()
  },

  onShareAppMessage() {
    const { currentYear, currentMonth, mode } = this.data
    const modeNames = { monthly: '月度', yearly: '年度', person: '按人', aa: 'AA结算' }
    return {
      title: `记账统计 - ${currentYear}年${currentMonth}月${modeNames[mode] || ''}分析`,
      path: '/pages/stats/stats'
    }
  },

  recalcAA() {
    const { currentYear, currentMonth, aaParticipants } = this.data
    const selectedIds = aaParticipants.filter(p => p.selected).map(p => p.id)
    if (selectedIds.length === 0) {
      this.setData({ aaResult: { totalExpense: 0, perPerson: 0, details: [] } })
      return
    }
    const result = storage.getAAResult(currentYear, currentMonth, selectedIds)
    // 更新 paid 和 balance
    const updated = aaParticipants.map(p => ({
      ...p,
      paid: (result.paid || {})[p.id] || 0,
      balance: (result.balance || {})[p.id] || 0
    }))
    this.setData({ aaResult: result, aaParticipants: updated })
  }
})
