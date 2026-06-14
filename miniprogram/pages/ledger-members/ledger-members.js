// pages/ledger-members/ledger-members.js — 共享账本成员管理

const ledger = require('../../utils/ledger')
const storage = require('../../utils/storage')

Page({
  data: {
    ledgerId: '',
    ledgerName: '',
    members: [],
    loading: true
  },

  onLoad(options) {
    this.ledgerId = options.id || ''
    const list = ledger.getLedgerList()
    const info = list.find(l => l.id === this.ledgerId)
    if (info) {
      this.setData({ ledgerName: info.name })
    }
  },

  onShow() {
    this.loadMembers()
  },

  loadMembers() {
    // 本地缓存
    const cached = ledger.getCachedMembers(this.ledgerId)
    if (cached && cached.length > 0) {
      this.setData({ members: cached, loading: false })
    }

    // 云端拉最新
    if (wx.cloud) {
      this.fetchCloudMembers()
    } else if (!cached || cached.length === 0) {
      // 无云端时用本地人员列表
      this.setData({ members: storage.getMembers(), loading: false })
    }
  },

  async fetchCloudMembers() {
    try {
      const cloudId = ledger.getCloudId(this.ledgerId)
      const res = await wx.cloud.callFunction({
        name: 'billData',
        data: { action: 'getLedgerMembers', ledgerId: cloudId }
      })
      if (res.result && res.result.success) {
        const members = res.result.data || []
        this.setData({ members, loading: false })
        ledger.setCachedMembers(this.ledgerId, members)
      }
    } catch (e) {
      // 降级到缓存
      const cached = ledger.getCachedMembers(this.ledgerId)
      this.setData({ members: cached.length > 0 ? cached : storage.getMembers(), loading: false })
    }
  },

  // 移除成员（仅 owner）
  removeMember(e) {
    const openid = e.currentTarget.dataset.id
    const member = this.data.members.find(m => m.openid === openid || m.id === openid)
    if (!member) return

    wx.showModal({
      title: '移除成员',
      content: `确定移除「${member.name || member.nickName || '该成员'}」？`,
      success: async (res) => {
        if (!res.confirm) return
        wx.showLoading({ title: '移除中...' })
        try {
          if (wx.cloud) {
            const cloudId = ledger.getCloudId(this.ledgerId)
            await wx.cloud.callFunction({
              name: 'billData',
              data: { action: 'removeLedgerMember', ledgerId: cloudId, memberId: openid }
            })
          }
          wx.hideLoading()
          this.loadMembers()
          wx.showToast({ title: '已移除', icon: 'success' })
        } catch (e) {
          wx.hideLoading()
          wx.showToast({ title: '操作失败', icon: 'none' })
        }
      }
    })
  },

  // 退出账本
  leaveLedger() {
    wx.showModal({
      title: '退出账本',
      content: '确定退出？退出后将无法查看此账本。',
      success: async (res) => {
        if (!res.confirm) return
        wx.showLoading({ title: '退出中...' })
        const result = await ledger.leaveLedger(this.ledgerId)
        wx.hideLoading()
        if (result.success) {
          wx.showToast({ title: '已退出', icon: 'success' })
          setTimeout(() => wx.navigateBack(), 800)
        } else {
          wx.showToast({ title: result.reason || '退出失败', icon: 'none' })
        }
      }
    })
  }
})
