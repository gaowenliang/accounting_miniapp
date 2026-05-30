// utils/storage.js — 数据存储管理（本地优先）

const util = require('./util')
const categories = require('../data/categories')

const StorageManager = {
  KEYS: {
    BILLS: 'bills',
    ACCOUNTS: 'accounts',
    BUDGET: 'budget',
    SETTINGS: 'settings',
    CATEGORIES_CACHE: 'categoriesCache'
  },

  // ========== 账单 ==========

  getBills() {
    try {
      return wx.getStorageSync(this.KEYS.BILLS) || []
    } catch (e) {
      console.error('读取账单失败:', e)
      return []
    }
  },

  saveBills(bills) {
    try {
      wx.setStorageSync(this.KEYS.BILLS, bills)
    } catch (e) {
      console.error('保存账单失败:', e)
      wx.showToast({ title: '存储空间不足', icon: 'none' })
    }
  },

  /**
   * 添加账单
   * @param {Object} bill { amount(分), type, category, note, account, date }
   */
  addBill(bill) {
    const bills = this.getBills()
    const record = {
      id: util.genId(),
      amount: bill.amount,         // 分
      type: bill.type,             // 'income' | 'expense'
      category: bill.category,     // 分类 key
      note: bill.note || '',
      account: bill.account || 'wechat',
      date: bill.date || Date.now(),
      createdAt: Date.now()
    }
    bills.unshift(record)
    // 保留最近 5000 条
    if (bills.length > 5000) bills.length = 5000
    this.saveBills(bills)
    return record
  },

  /**
   * 删除账单
   */
  deleteBill(billId) {
    let bills = this.getBills()
    bills = bills.filter(b => b.id !== billId)
    this.saveBills(bills)
  },

  /**
   * 更新账单
   */
  updateBill(billId, updates) {
    const bills = this.getBills()
    const idx = bills.findIndex(b => b.id === billId)
    if (idx !== -1) {
      bills[idx] = { ...bills[idx], ...updates, updatedAt: Date.now() }
      this.saveBills(bills)
    }
    return bills[idx]
  },

  /**
   * 获取某月账单
   */
  getBillsByMonth(year, month) {
    const start = util.monthStart(year, month)
    const end = util.monthEnd(year, month)
    return this.getBills().filter(b => b.date >= start && b.date <= end)
  },

  /**
   * 获取某天账单
   */
  getBillsByDay(timestamp) {
    const day = new Date(timestamp)
    const start = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime()
    const end = start + 86400000 - 1
    return this.getBills().filter(b => b.date >= start && b.date <= end)
  },

  /**
   * 搜索账单
   */
  searchBills(keyword) {
    const kw = keyword.toLowerCase()
    return this.getBills().filter(b =>
      (b.note && b.note.toLowerCase().includes(kw)) ||
      b.category.includes(kw)
    )
  },

  // ========== 账户 ==========

  getAccounts() {
    try {
      const stored = wx.getStorageSync(this.KEYS.ACCOUNTS)
      if (!stored || stored.length === 0) {
        // 首次使用，初始化默认账户
        const defaults = categories.DEFAULT_ACCOUNTS.map(a => ({
          ...a,
          id: util.genId(),
          balance: 0,    // 分
          isDefault: true
        }))
        this.saveAccounts(defaults)
        return defaults
      }
      return stored
    } catch (e) {
      console.error('读取账户失败:', e)
      return []
    }
  },

  saveAccounts(accounts) {
    try {
      wx.setStorageSync(this.KEYS.ACCOUNTS, accounts)
    } catch (e) {
      console.error('保存账户失败:', e)
    }
  },

  addAccount(account) {
    const accounts = this.getAccounts()
    accounts.push({
      id: util.genId(),
      name: account.name,
      icon: account.icon || '💳',
      type: account.type || 'digital',
      balance: 0,
      isDefault: false
    })
    this.saveAccounts(accounts)
    return accounts
  },

  deleteAccount(accountId) {
    let accounts = this.getAccounts()
    accounts = accounts.filter(a => a.id !== accountId)
    this.saveAccounts(accounts)
  },

  /**
   * 更新账户余额（记账时调用）
   */
  updateAccountBalance(accountKey, deltaFen) {
    const accounts = this.getAccounts()
    const account = accounts.find(a => a.key === accountKey || a.id === accountKey)
    if (account) {
      account.balance += deltaFen
      this.saveAccounts(accounts)
    }
  },

  // ========== 预算 ==========

  getBudget() {
    try {
      return wx.getStorageSync(this.KEYS.BUDGET) || {
        amount: 0,        // 分
        enabled: false,
        alertAt: 80       // 80% 时提醒
      }
    } catch (e) {
      return { amount: 0, enabled: false, alertAt: 80 }
    }
  },

  saveBudget(budget) {
    try {
      wx.setStorageSync(this.KEYS.BUDGET, budget)
    } catch (e) {
      console.error('保存预算失败:', e)
    }
  },

  // ========== 统计 ==========

  /**
   * 获取月度统计
   */
  getMonthStats(year, month) {
    const bills = this.getBillsByMonth(year, month)
    let totalIncome = 0
    let totalExpense = 0
    const categoryStats = {}

    bills.forEach(b => {
      if (b.type === 'income') {
        totalIncome += b.amount
      } else {
        totalExpense += b.amount
        if (!categoryStats[b.category]) {
          categoryStats[b.category] = { amount: 0, count: 0 }
        }
        categoryStats[b.category].amount += b.amount
        categoryStats[b.category].count += 1
      }
    })

    return {
      totalIncome,
      totalExpense,
      balance: totalIncome - totalExpense,
      billCount: bills.length,
      categoryStats,
      // 日均支出
      dailyAvg: totalExpense / new Date(year, month + 1, 0).getDate()
    }
  },

  /**
   * 获取年度统计
   */
  getYearStats(year) {
    let totalIncome = 0
    let totalExpense = 0
    const monthlyData = []

    for (let m = 0; m < 12; m++) {
      const stats = this.getMonthStats(year, m)
      totalIncome += stats.totalIncome
      totalExpense += stats.totalExpense
      monthlyData.push({
        month: m + 1,
        income: stats.totalIncome,
        expense: stats.totalExpense
      })
    }

    return {
      totalIncome,
      totalExpense,
      balance: totalIncome - totalExpense,
      monthlyData
    }
  },

  // ========== 设置 ==========

  getSettings() {
    return wx.getStorageSync(this.KEYS.SETTINGS) || {
      defaultAccount: 'wechat',
      defaultType: 'expense',
      budgetAlert: true
    }
  },

  saveSettings(settings) {
    wx.setStorageSync(this.KEYS.SETTINGS, settings)
  },

  // ========== 全局统计 ==========

  getOverallStats() {
    const bills = this.getBills()
    if (bills.length === 0) {
      return { totalBills: 0, totalDays: 0, firstDate: null }
    }
    const firstDate = bills[bills.length - 1].date
    const days = Math.max(1, Math.ceil((Date.now() - firstDate) / 86400000))
    return {
      totalBills: bills.length,
      totalDays: days,
      firstDate
    }
  }
}

module.exports = StorageManager
