// pages/ledger/ledger.js — 账本详情+统计

const ledger = require('../../utils/ledger')
const storage = require('../../utils/storage')
const categories = require('../../data/categories')
const util = require('../../utils/util')

Page({
  data: {
    ledger: null,
    stats: { totalExpense: 0, totalIncome: 0, billCount: 0, dayCount: 0 },
    statPeriod: 'month',
    periodStats: null,
    recentBills: [],
    showRename: false,
    newName: '',
  },

  onLoad(options) {
    const ledgerId = options.id
    const list = ledger.getLedgerList()
    const info = list.find(l => l.id === ledgerId)
    if (!info) { wx.navigateBack(); return }
    this.ledgerId = ledgerId
    this.setData({
      ledger: {
        ...info,
        createdAtText: new Date(info.createdAt || Date.now()).toLocaleDateString()
      }
    })
  },

  onShow() {
    this.loadStats()
    this.loadPeriodStats()
    this.loadRecentBills()
  },

  // ===== 统计 =====
  loadStats() {
    const bills = this.getBills()
    const days = new Set()
    let totalExpense = 0, totalIncome = 0
    bills.forEach(b => {
      const amt = b.amountCNY || b.amount
      if (b.type === 'expense') totalExpense += amt
      else totalIncome += amt
      const d = b.date ? new Date(b.date).toDateString() : null
      if (d) days.add(d)
    })
    this.setData({ stats: { totalExpense, totalIncome, billCount: bills.length, dayCount: days.size } })
  },

  loadPeriodStats() {
    const bills = this.getBills()
    const now = new Date()
    const period = this.data.statPeriod
    const filtered = bills.filter(b => {
      const d = new Date(b.date || b.createdAt || 0)
      if (period === 'month') return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
      if (period === 'year') return d.getFullYear() === now.getFullYear()
      return true // all
    })

    let totalExpense = 0, totalIncome = 0
    const catMap = {}
    const personMap = {}

    filtered.forEach(b => {
      const amt = b.amountCNY || b.amount
      if (b.type === 'expense') {
        totalExpense += amt
        const cat = categories.getCategoryBy(b.category, 'expense')
        catMap[cat.name] = (catMap[cat.name] || { icon: cat.icon, name: cat.name, color: cat.color, amount: 0 })
        catMap[cat.name].amount += amt
        // 人员
        const payer = b.payer || 'self'
        const members = storage.getMembers()
        const m = members.find(mm => mm.id === payer)
        const pName = m ? m.name : '未知'
        const pAvatar = m ? m.avatar : '❓'
        personMap[payer] = (personMap[payer] || { id: payer, name: pName, avatar: pAvatar, amount: 0 })
        personMap[payer].amount += amt
      } else {
        totalIncome += amt
      }
    })

    const maxExpense = Math.max(totalExpense, 1)
    const maxIncome = Math.max(totalIncome, 1)

    // 分类排行 top 8
    const catRank = Object.values(catMap)
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 8)
      .map(c => ({ ...c, pct: Math.round(c.amount / totalExpense * 100) }))

    // 人员排行
    const personRank = Object.values(personMap)
      .sort((a, b) => b.amount - a.amount)
      .map(p => ({ ...p, pct: Math.round(p.amount / totalExpense * 100) }))

    this.setData({
      periodStats: {
        totalExpense, totalIncome,
        balance: totalIncome - totalExpense,
        expensePct: Math.min(totalExpense / (totalExpense + totalIncome || 1) * 100, 100),
        incomePct: Math.min(totalIncome / (totalExpense + totalIncome || 1) * 100, 100),
        catRank, personRank
      }
    })
  },

  loadRecentBills() {
    const bills = this.getBills()
      .sort((a, b) => (b.date || b.createdAt || 0) - (a.date || a.createdAt || 0))
      .slice(0, 10)
      .map(b => {
        const cat = categories.getCategoryBy(b.category, b.type)
        return {
          id: b.id || Math.random(),
          icon: cat.icon, catName: cat.name,
          note: b.note, type: b.type,
          amountDisplay: b.amountCNY || b.amount
        }
      })
    this.setData({ recentBills: bills })
  },

  getBills() {
    const info = this.data.ledger
    if (info.type === 'shared' && ledger.isInLedger()) {
      return ledger.getCachedBills(this.ledgerId) || []
    }
    return storage.getBills()
  },

  setStatPeriod(e) {
    this.setData({ statPeriod: e.currentTarget.dataset.p })
    this.loadPeriodStats()
  },

  // ===== 操作 =====
  showRenameModal() { this.setData({ showRename: true, newName: this.data.ledger.name }) },
  cancelRename() { this.setData({ showRename: false }) },
  onNewNameInput(e) { this.setData({ newName: e.detail.value }) },
  confirmRename() {
    const name = this.data.newName.trim()
    if (!name) return
    const list = ledger.getLedgerList()
    const idx = list.findIndex(l => l.id === this.ledgerId)
    if (idx >= 0) {
      list[idx].name = name
      ledger.saveLedgerList(list)
      this.setData({ 'ledger.name': name, showRename: false })
      wx.showToast({ title: '已重命名', icon: 'success' })
    }
  },

  goMembers() {
    wx.navigateTo({ url: '/pages/ledger-members/ledger-members?id=' + this.ledgerId })
  },

  goBills() {
    // 切换到该账本后跳明细页
    ledger.switchLedger(this.ledgerId)
    wx.switchTab({ url: '/pages/bills/bills' })
  },

  async goExport() {
    const util = require('../../utils/util')
    const storage = require('../../utils/storage')
    const categories = require('../../data/categories')
    const ledger = require('../../utils/ledger')

    const current = ledger.getCurrentLedger()
    let bills
    if (current.inLedger && current.id) {
      await ledger.refreshBills(current.id)
      bills = ledger.getCachedBills(current.id)
    } else {
      bills = storage.getBills()
    }
    if (bills.length === 0) {
      wx.showToast({ title: '没有数据可导出', icon: 'none' }); return
    }

    const csv = util.billsToCSV(bills, storage.getActiveMembers(), categories)
    wx.setClipboardData({
      data: csv,
      success: () => wx.showToast({ title: '已复制到剪贴板', icon: 'success' })
    })
  },

  leaveLedger() {
    wx.showModal({
      title: '退出账本',
      content: '确定要退出吗？退出后不再看到此账本数据。',
      success: async (res) => {
        if (!res.confirm) return
        wx.showLoading({ title: '退出中' })
        const result = await ledger.leaveLedger(this.ledgerId)
        wx.hideLoading()
        if (result.success) {
          wx.showToast({ title: '已退出', icon: 'success' })
          setTimeout(() => wx.navigateBack(), 1000)
        } else {
          wx.showToast({ title: result.reason || '退出失败', icon: 'none' })
        }
      }
    })
  },

  deleteLedger() {
    wx.showModal({
      title: '⚠️ 删除账本',
      content: '此操作不可恢复！所有数据将被清除。',
      success: async (res) => {
        if (!res.confirm) return
        wx.showLoading({ title: '删除中' })
        if (this.data.ledger.type === 'shared') {
          const result = await ledger.leaveLedger(this.ledgerId)
          wx.hideLoading()
          if (result.success) {
            wx.showToast({ title: '已删除', icon: 'success' })
            setTimeout(() => wx.navigateBack(), 1000)
          } else {
            wx.showToast({ title: result.reason || '删除失败', icon: 'none' })
          }
        } else {
          // 个人账本：用 deleteLedger 统一处理
          const result = ledger.deleteLedger(this.ledgerId)
          wx.hideLoading()
          if (result.success) {
            wx.showToast({ title: '已删除', icon: 'success' })
            setTimeout(() => wx.navigateBack(), 1000)
          } else {
            wx.showToast({ title: result.reason || '删除失败', icon: 'none' })
          }
        }
      }
    })
  },
})
