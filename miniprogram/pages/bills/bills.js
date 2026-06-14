// pages/bills/bills.js — 账单明细

const util = require('../../utils/util')
const storage = require('../../utils/storage')
const categories = require('../../data/categories')
const currencies = require('../../data/currencies')
const ledger = require('../../utils/ledger')

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
    // 详情开关
    showDetail: false,
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

  toggleShowDetail() {
    this.setData({ showDetail: !this.data.showDetail })
  },

  previewReceipt(e) {
    const receipt = e.currentTarget.dataset.receipt
    if (!receipt) return
    wx.previewImage({ urls: [receipt] })
  },

  async loadBills() {
    const { currentYear, currentMonth, filterType, searchKeyword } = this.data
    this.setData({ monthLabel: `${currentYear}年${currentMonth}月` })

    // 一次取出全月数据（共享账本用缓存，个人用本地 storage）
    let allMonthBills
    const current = ledger.getCurrentLedger()
    if (current.inLedger && current.id) {
      // 共享账本模式：从云端缓存读
      await ledger.refreshBills(current.id)
      allMonthBills = ledger.getCachedBills(current.id)
        .filter(b => {
          const d = new Date(b.date)
          return d.getFullYear() === currentYear && (d.getMonth() + 1) === currentMonth
        })
      // 共享账本的 members 从云端缓存取
      var ledgerMembers = ledger.getCachedMembers(current.id)
      if (ledgerMembers.length === 0) {
        // 尝试拉取
        try {
          const cloudId = ledger.getCloudId(current.id)
          const res = await wx.cloud.callFunction({
            name: 'billData',
            data: { action: 'getLedgerMembers', ledgerId: cloudId }
          })
          if (res.result && res.result.success) {
            ledgerMembers = res.result.data.map(m => ({ id: m._openid, name: m.nickname || m._openid.slice(-4), avatar: '😊' }))
            ledger.setCachedMembers(current.id, ledgerMembers)
          }
        } catch (e) {}
      }
    } else {
      allMonthBills = storage.getBillsByMonth(currentYear, currentMonth)
    }

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
    // 预加载 members 避免循环内重复调用
    const members = storage.getActiveMembers()
    const memberMap = new Map(members.map(m => [m.id, m]))
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
      const payer = memberMap.get(b.payer || 'self')

      // 分摊信息
      let splitType = 'solo'  // solo=独占, aa=均摊, share=自定义
      let splitLabel = ''
      let splitDetail = ''
      let splitNames = ''
      let perPerson = ''
      if (b.splits && b.splits.length > 0) {
        const memberNames = b.splits.map(s => {
          const m = memberMap.get(s.memberId)
          return m ? m.name : '未知'
        })
        splitNames = memberNames.join('、')
        const total = b.amountCNY || b.amount
        perPerson = '¥' + (Math.round(total / b.splits.length) / 100).toFixed(2)
        // 判断类型：金额全一样=AA，否则=自定义分摊
        const amounts = b.splits.map(s => s.amount)
        const isAllEqual = amounts.every(a => a === amounts[0])
        if (isAllEqual) {
          splitType = 'aa'
          splitLabel = 'AA ' + b.splits.length + '人'
        } else {
          splitType = 'share'
          splitLabel = '分摊 ' + b.splits.length + '人'
        }
        // 分摊明细：人名 ¥金额
        splitDetail = b.splits.map(s => {
          const m = memberMap.get(s.memberId)
          const name = m ? m.name : '未知'
          return name + ' ¥' + (s.amount / 100).toFixed(2)
        }).join(' · ')
      } else {
        splitType = 'solo'
        splitLabel = members.length > 1 ? '独占' : ''
      }

      // 币种显示
      let currencySymbol = '¥'
      let currencyDisplay = ''
      if (b.currency && b.currency !== 'CNY') {
        const info = currencies.getCurrency(b.currency)
        currencySymbol = info ? info.symbol : ''
        currencyDisplay = info ? `${info.symbol}${(b.amount/100).toFixed(2)}` : `${b.currency} ${(b.amount/100).toFixed(2)}`
      }

      groups[dateStr].bills.push({
        ...b,
        categoryName: cat.name,
        categoryIcon: cat.icon,
        amountText: util.formatMoney(b.amount, false, currencySymbol),
        amountCNYText: b.amountCNY ? ((b.amountCNY / 100).toFixed(2)) : '',
        payerName: payer ? payer.name : '我',
        splitType,
        splitLabel,
        splitDetail,
        splitNames,
        perPerson,
        currencySymbol,
        currencyDisplay
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
    const newAmountFen = Math.round(amount * 100)
    let newAmountCNY = newAmountFen
    if (oldBill) {
      const oldAmountCNY = oldBill.amountCNY || oldBill.amount
      newAmountCNY = oldBill.currency && oldBill.currency !== 'CNY'
        ? currencies.toCNY(newAmountFen, oldBill.currency, oldBill.exchangeRate)
        : newAmountFen
      const oldDelta = oldBill.type === 'income' ? -oldAmountCNY : oldAmountCNY
      const newDelta = oldBill.type === 'income' ? newAmountCNY : -newAmountCNY
      storage.updateAccountBalance(oldBill.account, oldDelta + newDelta)
    }

    const updates = {
      amount: newAmountFen,
      category: editCategory,
      note: editNote.trim()
    }
    // 外币账单同步更新 amountCNY
    if (oldBill && oldBill.currency && oldBill.currency !== 'CNY') {
      updates.amountCNY = newAmountCNY
    }
    storage.updateBill(editingBillId, updates)

    this.setData({ showEditModal: false })
    this.loadBills()
    wx.showToast({ title: '已保存', icon: 'success' })
  }
})
