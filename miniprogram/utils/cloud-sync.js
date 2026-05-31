// utils/cloud-sync.js — 云端同步（参考养花小程序架构）

const CloudSync = {
  /**
   * 启动时同步
   */
  async syncOnStartup(storage) {
    if (!wx.cloud) return { mode: 'local' }

    try {
      const res = await wx.cloud.callFunction({
        name: 'billData',
        data: { action: 'getRecentBills', limit: 100 }
      })

      if (res.result && res.result.success) {
        const cloudBills = res.result.data || []
        if (cloudBills.length > 0) {
          const localBills = storage.getBills()

          // 建立 cloudId → 本地记录的映射（本地记录可能有 cloudId 字段）
          const localByCloudId = new Map()
          const localById = new Map()
          localBills.forEach(b => {
            if (b.cloudId) localByCloudId.set(b.cloudId, b)
            localById.set(b.id, b)
          })

          // 标记云端已覆盖的 cloudId
          const syncedCloudIds = new Set(cloudBills.map(b => b._id))

          // 云端记录 → 本地格式
          const synced = cloudBills.map(b => {
            const local = localByCloudId.get(b._id) || localById.get(b._id)
            return {
              id: local ? local.id : b._id,  // 保留本地 id
              cloudId: b._id,  // 记住云端 id
              amount: b.amount,
              amountCNY: b.amountCNY || b.amount,
              currency: b.currency || 'CNY',
              exchangeRate: b.exchangeRate || 1,
              type: b.type,
              category: b.category,
              note: b.note || '',
              account: b.account || 'wechat',
              date: b.date,
              payer: b.payer || 'self',
              splits: b.splits || null,
              createdAt: b.createdAt || b.date
            }
          })

          // 本地独有的（没被云端覆盖的）
          const localOnly = localBills.filter(b => {
            if (b.cloudId && syncedCloudIds.has(b.cloudId)) return false
            if (localByCloudId.has(b.id)) return false
            return !syncedCloudIds.has(b.id)
          })

          const merged = [...synced, ...localOnly]
          merged.sort((a, b) => b.date - a.date)
          storage.saveBills(merged)
          return { mode: 'synced', cloudCount: cloudBills.length, localOnlyCount: localOnly.length }
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
            amountCNY: bill.amountCNY,
            currency: bill.currency,
            exchangeRate: bill.exchangeRate,
            type: bill.type,
            category: bill.category,
            note: bill.note,
            account: bill.account,
            date: bill.date,
            payer: bill.payer,
            splits: bill.splits
          }
        }
      })
      // 把 cloudId 回写到本地
      if (res.result && res.result.success && res.result._id) {
        const bills = storage.getBills()
        const target = bills.find(b => b.id === bill.id)
        if (target && !target.cloudId) {
          target.cloudId = res.result._id
          storage.saveBills(bills)
        }
      }
      return { success: res.result && res.result.success }
    } catch (e) {
      console.warn('推送账单失败:', e)
      return { success: false, error: e.message }
    }
  }
}

module.exports = CloudSync
