// app.js — 全局入口
const storage = require('./utils/storage')
const cloudSync = require('./utils/cloud-sync')

App({
  onLaunch() {
    this.setupErrorMonitor()

    try {
      if (wx.cloud) {
        wx.cloud.init({ traceUser: true })
        this.cloudSync()
      }
    } catch (e) {
      console.debug('[app] 云开发未启用，本地模式')
    }

    this.globalData = {}
    // 初始化账户
    storage.getAccounts()
  },

  setupErrorMonitor() {
    wx.onUnhandledRejection((res) => {
      console.error('未处理的Promise拒绝:', res.reason)
      this.reportError('unhandledRejection', res.reason)
    })

    wx.onError((error) => {
      console.error('全局错误:', error)
      this.reportError('globalError', error)
    })
  },

  reportError(type, error) {
    try {
      const errors = wx.getStorageSync('errorLog') || []
      errors.unshift({
        type,
        error: String(error).substring(0, 500),
        time: Date.now(),
        page: getCurrentPages().length > 0
          ? getCurrentPages()[getCurrentPages().length - 1].route
          : 'unknown'
      })
      if (errors.length > 50) errors.length = 50
      wx.setStorageSync('errorLog', errors)
    } catch (e) { /* 静默 */ }
  },

  async cloudSync() {
    try {
      const result = await cloudSync.syncOnStartup()
      console.debug('[app] 云同步完成:', result)
    } catch (e) {
      console.warn('云同步失败:', e)
    }
  },

  globalData: {
    userInfo: null
  }
})
