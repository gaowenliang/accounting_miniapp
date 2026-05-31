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
    this.setData({ mode: e.currentTarget.dataset.mode })
    this.refresh()
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
    const { currentYear, currentMonth } = this.data
    const stats = storage.getMonthStats(currentYear, currentMonth)
    const ranking = storage.getCategoryRanking(currentYear, currentMonth)
    const trend = storage.getDailyTrend(currentYear, currentMonth)

    this.setData({
      monthExpense: stats.totalExpense,
      monthIncome: stats.totalIncome,
      monthBalance: stats.totalIncome - stats.totalExpense,
      categoryRanking: ranking,
      dailyTrend: trend
    })
  },

  // ========== 年度统计 ==========

  loadYearly() {
    const { currentYear } = this.data
    // 一次拉全年数据，避免循环 12 次
    const yearStart = util.monthStart(currentYear, 1)
    const yearEnd = util.monthEnd(currentYear, 12)
    const allBills = storage.getBills().filter(b => b.date >= yearStart && b.date <= yearEnd)

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
    const bills = storage.getBillsByMonth(currentYear, currentMonth)
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
    const members = storage.getMembers()
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
