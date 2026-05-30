// pages/ledger/ledger.js — 账本详情页（设置/编辑/成员管理）

const ledger = require('../../utils/ledger')

Page({
  data: {
    ledgerId: '',
    ledger: null,
    showRename: false,
    newName: ''
  },

  onLoad(options) {
    if (options.id) {
      this.setData({ ledgerId: options.id })
      this.loadLedger()
    }
  },

  loadLedger() {
    const list = ledger.getLedgerList()
    const target = list.find(l => l.id === this.data.ledgerId)
    if (target) {
      this.setData({ ledger: target, newName: target.name })
    } else {
      wx.showToast({ title: '账本不存在', icon: 'none' })
      wx.navigateBack()
    }
  },

  // 重命名
  showRenameModal() {
    this.setData({ showRename: true })
  },

  onNewNameInput(e) {
    this.setData({ newName: e.detail.value })
  },

  confirmRename() {
    const result = ledger.renameLedger(this.data.ledgerId, this.data.newName)
    if (result.success) {
      this.setData({ showRename: false })
      this.loadLedger()
      wx.showToast({ title: '已重命名', icon: 'success' })
    } else {
      wx.showToast({ title: result.reason, icon: 'none' })
    }
  },

  cancelRename() { this.setData({ showRename: false }) },

  // 删除
  deleteLedger() {
    wx.showModal({
      title: '删除账本',
      content: `确定删除「${this.data.ledger.name}」？账本内的记录不会被删除。`,
      success: (res) => {
        if (res.confirm) {
          const result = ledger.deleteLedger(this.data.ledgerId)
          if (result.success) {
            wx.navigateBack()
            wx.showToast({ title: '已删除', icon: 'success' })
          } else {
            wx.showToast({ title: result.reason, icon: 'none' })
          }
        }
      }
    })
  },

  // 退出共享账本
  leaveLedger() {
    wx.showModal({
      title: '退出账本',
      content: `确定退出「${this.data.ledger.name}」？`,
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '退出中...' })
          await ledger.leaveLedger(this.data.ledgerId)
          wx.hideLoading()
          wx.navigateBack()
          wx.showToast({ title: '已退出', icon: 'success' })
        }
      }
    })
  },

  // 查看成员
  goMembers() {
    wx.navigateTo({ url: `/pages/ledger-members/ledger-members?id=${this.data.ledgerId}` })
  }
})
