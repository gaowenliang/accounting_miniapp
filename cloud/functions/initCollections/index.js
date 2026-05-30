// cloud/functions/initCollections/index.js — 初始化云数据库集合

const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  const collections = ['bills', 'accounts', 'budgets']
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
