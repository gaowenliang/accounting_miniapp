// utils/storage.js — 数据存储管理（本地优先）

const util = require('./util')
const categories = require('../data/categories')

const StorageManager = {
  KEYS: {
    BILLS: 'bills',
    ACCOUNTS: 'accounts',
    BUDGET: 'budget',
    SETTINGS: 'settings',
    CATEGORIES_CACHE: 'categoriesCache',
    MEMBERS: 'members'
  },

  // 内存缓存，避免高频重复读取 Storage
  _cache: {},
  // 按月索引: { '2026-5': [billId, ...] }，加速按月查询
  _monthIndex: null,
  // 统计缓存: { 'stats_2026-5': { data, signature } }，signature 为账单数+最新时间戳
  _statsCache: {},

  _getCached(key) {
    if (this._cache[key] !== undefined) return this._cache[key]
    let val
    try { val = wx.getStorageSync(key) } catch (e) { val = null }
    this._cache[key] = val
    return val
  },

  _setCached(key, val) {
    this._cache[key] = val
    try { wx.setStorageSync(key, val) } catch (e) { console.error('save failed:', key, e) }
  },

  invalidateCache() {
    this._cache = {}
    this._monthIndex = null
    this._statsCache = {}
  },

  // ========== 按月索引 ===========

  /**
   * 构建或重建按月索引（懒加载，首次调用 getBillsByMonth 时触发）
   */
  _ensureMonthIndex() {
    if (this._monthIndex) return
    this._monthIndex = {}
    const bills = this.getBills()
    for (const b of bills) {
      if (!b.date) continue
      const d = new Date(b.date)
      const key = d.getFullYear() + '-' + (d.getMonth() + 1)
      if (!this._monthIndex[key]) this._monthIndex[key] = []
      this._monthIndex[key].push(b)
    }
  },

  /**
   * 增量更新索引（单条账单变化时）
   */
  _indexBill(bill, action) {
    if (!this._monthIndex || !bill.date) return
    const d = new Date(bill.date)
    const key = d.getFullYear() + '-' + (d.getMonth() + 1)
    if (!this._monthIndex[key]) this._monthIndex[key] = []
    if (action === 'add') {
      this._monthIndex[key].unshift(bill)
    } else if (action === 'remove') {
      this._monthIndex[key] = this._monthIndex[key].filter(b => b.id !== bill.id)
    }
    // 统计缓存失效
    this._invalidateStatsCache(key)
  },

  _invalidateStatsCache(monthKey) {
    delete this._statsCache['stats_' + monthKey]
    delete this._statsCache['ranking_' + monthKey]
    delete this._statsCache['trend_' + monthKey]
  },

  /**
   * 计算统计签名（用于检测数据是否变化）
   */
  _statsSignature(bills) {
    if (bills.length === 0) return '0_0'
    let maxTs = 0
    for (const b of bills) {
      const ts = b.updatedAt || b.createdAt || b.date || 0
      if (ts > maxTs) maxTs = ts
    }
    return bills.length + '_' + maxTs
  },

  // ========== 账单 ==========

  getBills() {
    // 共享账本模式返回云端缓存
    try {
      const ledger = require('./ledger')
      const current = ledger.getCurrentLedger()
      if (current.inLedger && current.id) {
        return ledger.getCachedBills(current.id) || []
      }
    } catch (e) {}
    const cached = this._getCached(this.KEYS.BILLS)
    return cached || []
  },

  saveBills(bills) {
    this._setCached(this.KEYS.BILLS, bills)
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
      type: bill.type,             // 'income' | 'expense' | 'transfer'
      category: bill.category,     // 分类 key
      note: bill.note || '',
      account: bill.account || 'wechat',
      date: bill.date || Date.now(),
      payer: bill.payer || 'self',
      splits: bill.splits || null, // [{memberId, amount}] 分摊明细
      targetAccount: bill.targetAccount || null, // 转账目标账户
      tags: bill.tags || [],       // 标签
      createdBy: 'local',          // 本地创建标识
      currency: bill.currency || 'CNY',  // 币种
      exchangeRate: bill.exchangeRate || 1, // 汇率（非CNY时）
      amountCNY: bill.amountCNY || bill.amount, // 人民币等值（分）
      createdAt: Date.now()
    }
    bills.unshift(record)
    // 保留最近 5000 条
    if (bills.length > 5000) bills.length = 5000
    this.saveBills(bills)
    this._indexBill(record, 'add')
    return record
  },

  /**
   * 删除账单
   */
  deleteBill(billId) {
    let bills = this.getBills()
    const deleted = bills.find(b => b.id === billId)
    bills = bills.filter(b => b.id !== billId)
    this.saveBills(bills)
    if (deleted) this._indexBill(deleted, 'remove')
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
      // 重建该月索引（日期可能变了）
      if (this._monthIndex) {
        this._monthIndex = null
        this._statsCache = {}
      }
    }
    return bills[idx]
  },

  /**
   * 获取某月账单（使用按月索引，O(1) 查找）
   * 共享账本模式下自动走云端缓存
   */
  getBillsByMonth(year, month) {
    // 检查是否在共享账本模式
    try {
      const ledger = require('./ledger')
      const current = ledger.getCurrentLedger()
      if (current.inLedger && current.id) {
        const all = ledger.getCachedBills(current.id) || []
        return all.filter(b => {
          const d = new Date(b.date)
          return d.getFullYear() === year && (d.getMonth() + 1) === month
        })
      }
    } catch (e) {}
    // 个人模式
    this._ensureMonthIndex()
    const key = year + '-' + month
    return this._monthIndex[key] || []
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
    const stored = this._getCached(this.KEYS.ACCOUNTS)
    if (!stored || stored.length === 0) {
      const defaults = categories.DEFAULT_ACCOUNTS.map(a => ({
        ...a,
        id: util.genId(),
        balance: 0,
        isDefault: true
      }))
      this.saveAccounts(defaults)
      return defaults
    }
    return stored
  },

  saveAccounts(accounts) {
    this._setCached(this.KEYS.ACCOUNTS, accounts)
  },

  addAccount(account) {
    const accounts = this.getAccounts()
    accounts.push({
      id: util.genId(),
      key: account.key || 'custom_' + Date.now(),
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
    return this._getCached(this.KEYS.BUDGET) || {
      amount: 0,
      enabled: false,
      alertAt: 80
    }
  },

  saveBudget(budget) {
    this._setCached(this.KEYS.BUDGET, budget)
  },

  // ========== 统计 ==========

  /**
   * 获取月度统计（带缓存，数据未变化时直接返回）
   */
  getMonthStats(year, month) {
    const monthKey = year + '-' + month
    const bills = this.getBillsByMonth(year, month)
    const sig = this._statsSignature(bills)
    const cacheKey = 'stats_' + monthKey
    if (this._statsCache[cacheKey] && this._statsCache[cacheKey].signature === sig) {
      return this._statsCache[cacheKey].data
    }

    let totalIncome = 0
    let totalExpense = 0
    const categoryStats = {}

    bills.forEach(b => {
      if (b.type === 'income') {
        totalIncome += (b.amountCNY || b.amount)
      } else if (b.type === 'expense') {
        totalExpense += (b.amountCNY || b.amount)
        if (!categoryStats[b.category]) {
          categoryStats[b.category] = { amount: 0, count: 0 }
        }
        categoryStats[b.category].amount += (b.amountCNY || b.amount)
        categoryStats[b.category].count += 1
      }
      // transfer 类型不计入收支统计
    })

    const data = {
      totalIncome,
      totalExpense,
      balance: totalIncome - totalExpense,
      billCount: bills.length,
      categoryStats,
      // 日均支出
      dailyAvg: totalExpense / new Date(year, month, 0).getDate()
    }
    this._statsCache[cacheKey] = { data, signature: sig }
    return data
  },

  /**
   * 获取年度统计
   */
  getYearStats(year) {
    const yearStart = this.getBills().length > 0
      ? new Date(year, 0, 1).getTime()
      : 0
    const yearEnd = new Date(year, 11, 31, 23, 59, 59, 999).getTime()
    const allBills = this.getBills().filter(b => b.date >= yearStart && b.date <= yearEnd)

    let totalIncome = 0
    let totalExpense = 0
    const monthlyData = []

    for (let m = 1; m <= 12; m++) {
      const ms = util.monthStart(year, m)
      const me = util.monthEnd(year, m)
      const monthBills = allBills.filter(b => b.date >= ms && b.date <= me)
      let income = 0, expense = 0
      monthBills.forEach(b => {
        const amt = b.amountCNY || b.amount
        if (b.type === 'income') income += amt
        else expense += amt
      })
      totalIncome += income
      totalExpense += expense
      monthlyData.push({ month: m, income, expense })
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
    return this._getCached(this.KEYS.SETTINGS) || {
      defaultAccount: 'wechat',
      defaultType: 'expense',
      budgetAlert: true
    }
  },

  saveSettings(settings) {
    this._setCached(this.KEYS.SETTINGS, settings)
  },

  // ========== 人员管理 ==========

  getMembers() {
    return this._getCached(this.KEYS.MEMBERS) || [
      { id: 'self', name: '我', avatar: '😊', isDefault: true }
    ]
  },

  saveMembers(members) {
    this._setCached(this.KEYS.MEMBERS, members)
  },

  addMember(name, avatar = '😊') {
    const members = this.getMembers()
    if (members.find(m => m.name === name)) return members
    members.push({ id: 'm_' + Date.now(), name, avatar, isDefault: false })
    this.saveMembers(members)
    return members
  },

  removeMember(memberId) {
    let members = this.getMembers()
    const removed = members.find(m => m.id === memberId)
    members = members.filter(m => m.id !== memberId)
    this.saveMembers(members)
    // 保存到历史记录（用于"从历史导入"）
    if (removed && !removed.isDefault) {
      const history = this.getDeletedMembers()
      if (!history.find(h => h.name === removed.name)) {
        history.push({ name: removed.name, avatar: removed.avatar || '😊', deletedAt: Date.now() })
        this.saveDeletedMembers(history)
      }
    }
  },

  getDeletedMembers() {
    try { return wx.getStorageSync('deletedMembers') || [] } catch (e) { return [] }
  },

  saveDeletedMembers(list) {
    try { wx.setStorageSync('deletedMembers', list) } catch (e) {}
  },

  // ========== 按人统计 ==========

  /**
   * 获取某月按人统计
   * @returns {Array} [{ memberId, name, avatar, totalExpense, totalIncome, billCount, categories }]
   */
  getPersonStats(year, month) {
    const bills = this.getBillsByMonth(year, month)
    const members = this.getMembers()
    const memberMap = {}
    members.forEach(m => { memberMap[m.id] = { ...m, totalExpense: 0, totalIncome: 0, billCount: 0, categories: {} } })

    bills.forEach(b => {
      const payerId = b.payer || 'self'
      if (!memberMap[payerId]) {
        memberMap[payerId] = { id: payerId, name: '未知', avatar: '❓', totalExpense: 0, totalIncome: 0, billCount: 0, categories: {} }
      }
      const stat = memberMap[payerId]
      stat.billCount++
      if (b.type === 'expense') {
        stat.totalExpense += (b.amountCNY || b.amount)
        const cat = b.category || 'other'
        stat.categories[cat] = (stat.categories[cat] || 0) + (b.amountCNY || b.amount)
      } else if (b.type === 'income') {
        stat.totalIncome += (b.amountCNY || b.amount)
      }
      // transfer 不计入
    })

    // 转换分类为排序列表，带百分比
    const result = Object.values(memberMap).filter(s => s.billCount > 0).sort((a, b) => b.totalExpense - a.totalExpense)
    result.forEach(stat => {
      const maxCat = Math.max(...Object.values(stat.categories), 1)
      stat.catList = Object.entries(stat.categories)
        .map(([key, amount]) => {
          const catInfo = categories.getCategoryBy(key, 'expense')
          return { name: catInfo.name || key, amount, percent: Math.round(amount / maxCat * 100) }
        })
        .sort((a, b) => b.amount - a.amount)
    })
    return result
  },

  /**
   * AA结算计算
   * 核心逻辑：
   *   - 每笔支出由 payer 全额垫付
   *   - 有 splits 时，splits 表示每人应承担的份额（不是实付）
   *   - 无 splits 时，参与人均攤
   *   - 最后计算每人「垫付总额 - 应承担总额」= 净差额
   * @param {number} year
   * @param {number} month
   * @param {Array} participantIds 参与AA的人员ID列表，不传则用全部人员
   * @returns {{ totalExpense, perPerson, details }}
   */
  /**
   * AA结算计算（全量，覆盖整个账本所有支出）
   */
  getAAResultAll(participantIds) {
    const bills = this.getBills().filter(b => b.type === 'expense')
    const members = this.getActiveMembers()
    return this._calcAA(bills, members, participantIds)
  },

  /**
   * AA结算计算（按月）
   */
  getAAResult(year, month, participantIds) {
    const bills = this.getBillsByMonth(year, month)
    const members = this.getMembers()
    return this._calcAA(bills, members, participantIds)
  },

  /**
   * AA结算核心算法
   * @param {Array} bills 支出账单列表
   * @param {Array} members 成员列表
   * @param {Array} participantIds 参与AA的人员ID列表，不传则用全部成员
   */
  _calcAA(bills, members, participantIds) {
    const memberMap = {}
    members.forEach(m => { memberMap[m.id] = m })

    // 参与AA的人
    const participants = participantIds || members.map(m => m.id)
    const participantSet = new Set(participants)
    const personCount = participants.length
    if (personCount === 0) return { totalExpense: 0, perPerson: 0, details: [], personCount: 0, paid: {}, balance: {} }

    // 只算支出账单
    const expenseBills = bills.filter(b => b.type === 'expense')

    // 每人垫付总额（payer 实际付了多少）
    const paid = {}
    // 每人应承担总额（根据 splits 或均攤）
    const shouldPay = {}
    participants.forEach(id => { paid[id] = 0; shouldPay[id] = 0 })
    let totalExpense = 0

    expenseBills.forEach(b => {
      const billAmount = b.amountCNY || b.amount
      const payerId = b.payer || 'self'

      // payer 不在参与者中：这笔支出计入 totalExpense，但只算对 payer 的应收
      // 参与者不需要承担这笔钱（因为 payer 不是「我们的人」）
      if (!participantSet.has(payerId)) {
        totalExpense += billAmount
        paid[payerId] = (paid[payerId] || 0) + billAmount
        // shouldPay 不分配，payer 全权承担
        return
      }

      totalExpense += billAmount
      paid[payerId] = (paid[payerId] || 0) + billAmount

      // 计算每人应承担多少
      if (b.splits && b.splits.length > 0) {
        // 有分摊明细：splits 表示每人应承担的金额
        // 外币 splits：最后一个分攤者吸收取整误差，保证总额守恒
        if (b.currency && b.currency !== 'CNY' && b.exchangeRate && b.amount > 0) {
          let splitSum = 0
          const splitsInCNY = b.splits.filter(s => participantSet.has(s.memberId)).map((s, i, arr) => {
            if (i < arr.length - 1) {
              const ratio = b.amount > 0 ? s.amount / b.amount : 0
              const v = Math.round(ratio * billAmount)
              splitSum += v
              return { memberId: s.memberId, amount: v }
            } else {
              // 最后一个取剩余值
              return { memberId: s.memberId, amount: billAmount - splitSum }
            }
          })
          splitsInCNY.forEach(s => {
            if (participantSet.has(s.memberId)) {
              shouldPay[s.memberId] = (shouldPay[s.memberId] || 0) + s.amount
            }
          })
        } else {
          // CNY splits 直接用
          b.splits.forEach(s => {
            if (participantSet.has(s.memberId)) {
              shouldPay[s.memberId] = (shouldPay[s.memberId] || 0) + s.amount
            }
          })
        }
        // splits 可能没覆盖所有参与人，未覆盖的人承担 0
      } else {
        // 无分摊：参与人均攤
        const perPersonShare = Math.floor(billAmount / personCount)
        const remainder = billAmount - perPersonShare * personCount
        participants.forEach((id, idx) => {
          shouldPay[id] = (shouldPay[id] || 0) + perPersonShare + (idx < remainder ? 1 : 0)
        })
      }
    })

    // 每人净差额 = 垫付 - 应承担
    // 正数=多付了（应收），负数=少付了（应付）
    const balance = {}
    participants.forEach(id => {
      balance[id] = (paid[id] || 0) - (shouldPay[id] || 0)
    })

    const perPerson = Math.floor(totalExpense / personCount)

    // 贪心算法算谁给谁
    const details = []
    const debtors = []   // 欠钱的 [{ id, amount }]  amount>0
    const creditors = [] // 多付的 [{ id, amount }]  amount>0
    participants.forEach(id => {
      if (balance[id] > 0) creditors.push({ id, amount: balance[id] })
      else if (balance[id] < 0) debtors.push({ id, amount: -balance[id] })
    })

    debtors.sort((a, b) => b.amount - a.amount)
    creditors.sort((a, b) => b.amount - a.amount)

    let di = 0, ci = 0
    while (di < debtors.length && ci < creditors.length) {
      const d = debtors[di], c = creditors[ci]
      const settle = Math.min(d.amount, c.amount)
      if (settle > 0) {
        details.push({
          from: d.id,
          fromName: (memberMap[d.id] || {}).name || '未知',
          to: c.id,
          toName: (memberMap[c.id] || {}).name || '未知',
          amount: settle
        })
      }
      d.amount -= settle
      c.amount -= settle
      if (d.amount <= 0) di++
      if (c.amount <= 0) ci++
    }

    return {
      totalExpense,
      perPerson,
      personCount,
      paid,           // 每人垫付总额
      shouldPay,      // 每人应承担总额
      balance,        // 每人净差额 正=应收 负=应付
      details         // 结算明细
    }
  },

  /**
   * 分类支出排行（带缓存）
   */
  getCategoryRanking(year, month) {
    const monthKey = year + '-' + month
    const bills = this.getBillsByMonth(year, month)
    const sig = this._statsSignature(bills)
    const cacheKey = 'ranking_' + monthKey
    if (this._statsCache[cacheKey] && this._statsCache[cacheKey].signature === sig) {
      return this._statsCache[cacheKey].data
    }

    const expenseBills = bills.filter(b => b.type === 'expense')
    const totalExpense = expenseBills.reduce((s, b) => s + (b.amountCNY || b.amount), 0) || 1
    const catMap = {}
    expenseBills.forEach(b => {
      if (!catMap[b.category]) catMap[b.category] = 0
      catMap[b.category] += (b.amountCNY || b.amount)
    })
    const data = Object.entries(catMap)
      .map(([key, amount]) => {
        const catInfo = categories.getCategoryBy(key, 'expense')
        return {
          key,
          name: catInfo.name || key,
          icon: catInfo.icon || '📦',
          color: catInfo.color || '#607D8B',
          amount,
          percent: Math.round(amount / totalExpense * 100)
        }
      })
      .sort((a, b) => b.amount - a.amount)
    this._statsCache[cacheKey] = { data, signature: sig }
    return data
  },

  /**
   * 每日支出趋势（带缓存）
   */
  getDailyTrend(year, month) {
    const monthKey = year + '-' + month
    const bills = this.getBillsByMonth(year, month)
    const sig = this._statsSignature(bills)
    const cacheKey = 'trend_' + monthKey
    if (this._statsCache[cacheKey] && this._statsCache[cacheKey].signature === sig) {
      return this._statsCache[cacheKey].data
    }

    const expenseBills = bills.filter(b => b.type === 'expense')
    const daysInMonth = new Date(year, month, 0).getDate()
    const dayMap = {}
    for (let d = 1; d <= daysInMonth; d++) dayMap[d] = 0
    expenseBills.forEach(b => {
      const day = new Date(b.date).getDate()
      dayMap[day] = (dayMap[day] || 0) + (b.amountCNY || b.amount)
    })
    const maxVal = Math.max(...Object.values(dayMap), 1)
    const data = Object.entries(dayMap).map(([day, amount]) => ({
      day: parseInt(day),
      amount,
      height: Math.round(amount / maxVal * 100)
    }))
    this._statsCache[cacheKey] = { data, signature: sig }
    return data
  },

  // ========== 多维度统计（月度子维度） ==========

  /**
   * 按币种统计
   */
  getCurrencyStats(year, month) {
    const bills = this.getBillsByMonth(year, month)
    const currencyMap = {}
    const currencies = require('../data/currencies')
    let totalCNY = 0
    // 只统计支出，区分收入
    const expenseBills = bills.filter(b => b.type === 'expense')
    expenseBills.forEach(b => {
      const cur = b.currency || 'CNY'
      const amtCNY = b.amountCNY || b.amount
      if (!currencyMap[cur]) currencyMap[cur] = { code: cur, count: 0, amount: 0, amountCNY: 0 }
      currencyMap[cur].count++
      currencyMap[cur].amount += b.amount
      currencyMap[cur].amountCNY += amtCNY
      totalCNY += amtCNY
    })
    // 转数组 + 加百分比
    const list = Object.values(currencyMap).map(c => {
      const info = currencies.getCurrency(c.code)
      return {
        ...c,
        symbol: info.symbol,
        name: info.name,
        flag: info.flag,
        rate: info.rate,
        percent: totalCNY > 0 ? Math.round(c.amountCNY / totalCNY * 100) : 0
      }
    }).sort((a, b) => b.amountCNY - a.amountCNY)
    return { list, totalCNY }
  },

  /**
   * 按账户统计
   */
  getAccountStats(year, month) {
    const bills = this.getBillsByMonth(year, month)
    const accounts = this.getAccounts()
    const members = this.getActiveMembers()
    const memberMap = new Map(members.map(m => [m.id, m]))
    const accountMap = new Map(accounts.map(a => [a.key, a]))
    const statsMap = {}
    let totalCNY = 0

    // 只统计支出
    const expenseBills = bills.filter(b => b.type === 'expense')
    expenseBills.forEach(b => {
      const amt = b.amountCNY || b.amount
      const accountKey = b.account || 'unknown'
      const payerId = b.payer || 'self'
      const payer = memberMap.get(payerId)
      const payerName = payer ? payer.name : '我'
      const accountObj = accountMap.get(accountKey)
      const accountName = accountObj ? accountObj.name : accountKey
      const key = `${payerName}-${accountName}`

      if (!statsMap[key]) statsMap[key] = {
        accountKey, payerId, payerName, accountName,
        count: 0, amount: 0, amountCNY: 0
      }
      statsMap[key].count++
      statsMap[key].amount += b.amount
      statsMap[key].amountCNY += amt
      totalCNY += amt
    })

    const list = Object.values(statsMap).map(a => ({
      ...a,
      percent: totalCNY > 0 ? Math.round(a.amountCNY / totalCNY * 100) : 0
    })).sort((a, b) => b.amountCNY - a.amountCNY)

    return { list, totalCNY }
  },

  // ========== 统一数据获取（支持共享账本） ==========

  /**
   * 获取当前生效的账单（个人本地 or 共享缓存）
   * 页面统一调这个，不用关心在哪个账本
   */
  getActiveBills() {
    const ledger = require('./ledger')
    const current = ledger.getCurrentLedger()
    if (current.inLedger && current.id) {
      return this.getCachedBillsForLedger(current.id)
    }
    return this.getBills()
  },

  getActiveBillsByMonth(year, month) {
    const ledger = require('./ledger')
    const current = ledger.getCurrentLedger()
    if (current.inLedger && current.id) {
      const all = ledger.getCachedBills(current.id) || []
      return all.filter(b => {
        const d = new Date(b.date)
        return d.getFullYear() === year && (d.getMonth() + 1) === month
      })
    }
    return this.getBillsByMonth(year, month)
  },

  getActiveMembers() {
    const ledger = require('./ledger')
    const current = ledger.getCurrentLedger()
    if (current.inLedger && current.id) {
      const cached = ledger.getCachedMembers(current.id)
      if (cached && cached.length > 0) return cached
    }
    return this.getMembers()
  },

  getCachedBillsForLedger(ledgerId) {
    const ledger = require('./ledger')
    return ledger.getCachedBills(ledgerId) || []
  },

  // ========== 成员分组 ==========

  getMemberGroups() {
    try {
      return wx.getStorageSync('memberGroups') || []
    } catch (e) { return [] }
  },

  saveMemberGroups(groups) {
    try {
      wx.setStorageSync('memberGroups', groups)
    } catch (e) { console.error('saveMemberGroups error', e) }
  },

  // ========== 全局统计 ==========

  // 导出通用缓存接口，供 ledger 等模块使用
  cachedGet(key, fallback = null) {
    return this._getCached(key) || fallback
  },
  cachedSet(key, val) {
    this._setCached(key, val)
  },

  clearBills() {
    this._setCached(this.KEYS.BILLS, [])
    this._monthIndex = null
    this._statsCache = {}
  },

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
