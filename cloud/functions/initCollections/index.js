// cloud/functions/initCollections/index.js — 初始化云数据库集合

const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  const collections = [
    'bills',          // 个人账单
    'ledger_bills',   // 共享账本账单
    'ledgers',        // 账本
    'ledger_members', // 账本成员
    'accounts'        // 账户
  ]
  const results = []

  for (const name of collections) {
    try {
      await db.createCollection(name)
      results.push({ collection: name, status: 'created' })
    } catch (e) {
      if (e.message.includes('already exists')) {
        results.push({ collection: name, status: 'already_exists' })
      } else {
        results.push({ collection: name, status: 'error', error: e.message })
      }
    }
  }

  return { success: true, results }
}
