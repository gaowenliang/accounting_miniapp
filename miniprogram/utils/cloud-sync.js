// utils/cloud-sync.js — 云端同步（参考养花小程序架构）

const CloudSync = {
  /**
   * 启动时同步
   */
  async syncOnStartup(storage) {
    if (!wx.cloud) return { mode: 'local' }

    try {
      // 拉取云端最新数据
      const res = await wx.cloud.callFunction({
        name: 'billData',
        data: { action: 'getRecentBills', limit: 100 }
      })

      if (res.result && res.result.success) {
        const cloudBills = res.result.data || []
        if (cloudBills.length > 0) {
          // 合并：以云端为准，本地独有的追加
          const localBills = storage.getBills()
          const cloudIds = new Set(cloudBills.map(b => b._id))
          const merged = [
            ...cloudBills.map(b => ({
              id: b._id,
              amount: b.amount,
              type: b.type,
              category: b.category,
              note: b.note || '',
              account: b.account || 'wechat',
              date: b.date,
              createdAt: b.createdAt || b.date
            })),
            ...localBills.filter(b => !cloudIds.has(b.id))
          ]
          // 按日期排序
          merged.sort((a, b) => b.date - a.date)
          storage.saveBills(merged)
          return { mode: 'synced', count: merged.length }
        }
      }
      return { mode: 'local' }
    } catch (e) {
      console.warn('云同步失败，使用本地数据:', e)
      return { mode: 'local', error: e.message }
    }
  },

  /**
   * 推送单条账单到云端
   */
  async pushBill(bill) {
    if (!wx.cloud) return { success: false, reason: 'no cloud' }

    try {
      const res = await wx.cloud.callFunction({
        name: 'billData',
        data: {
          action: 'addBill',
          data: {
            amount: bill.amount,
            type: bill.type,
            category: bill.category,
            note: bill.note,
            account: bill.account,
            date: bill.date
          }
        }
      })
      return { success: res.result && res.result.success }
    } catch (e) {
      console.warn('推送账单失败:', e)
      return { success: false, error: e.message }
    }
  }
}

module.exports = CloudSync
