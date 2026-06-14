// cloud/functions/accountData/index.js — 账户管理云函数

const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const { checkRateLimit } = require('./rateLimit')

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext()
  const { action } = event

  // 写操作防刷
  if (['create', 'update', 'delete'].includes(action)) {
    if (!checkRateLimit(OPENID)) {
      return { success: false, error: '操作太频繁，请稍后再试' }
    }
  }

  switch (action) {
    case 'list':
      return listAccounts(OPENID)
    case 'create':
      return createAccount(OPENID, event.data)
    case 'update':
      return updateAccount(OPENID, event.accountId, event.data)
    case 'delete':
      return deleteAccount(OPENID, event.accountId)
    default:
      return { success: false, error: 'Unknown action' }
  }
}

async function listAccounts(openid) {
  try {
    const result = await db.collection('accounts')
      .where({ _openid: openid })
      .orderBy('sort', 'asc')
      .limit(100)
      .get()
    return { success: true, data: result.data }
  } catch (e) {
    return { success: false, error: e.message }
  }
}

async function createAccount(openid, data) {
  if (!data || !data.name) return { success: false, error: '缺少账户名称' }
  try {
    const doc = {
      _openid: openid,
      name: data.name,
      icon: data.icon || '💳',
      type: data.type || 'bank',    // wechat/alipay/cash/card/credit
      balance: data.balance || 0,
      creditLimit: data.creditLimit || 0,
      isDefault: data.isDefault || false,
      sort: data.sort || 99,
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
    const result = await db.collection('accounts').add({ data: doc })
    return { success: true, _id: result._id }
  } catch (e) {
    return { success: false, error: e.message }
  }
}

async function updateAccount(openid, accountId, data) {
  if (!accountId) return { success: false, error: '缺少 accountId' }
  try {
    // 验证所有权
    const doc = await db.collection('accounts').doc(accountId).get()
    if (!doc.data || doc.data._openid !== openid) {
      return { success: false, error: '无权操作' }
    }
    const update = { ...data, updatedAt: Date.now() }
    delete update._openid  // 不允许改
    delete update._id
    await db.collection('accounts').doc(accountId).update({ data: update })
    return { success: true }
  } catch (e) {
    return { success: false, error: e.message }
  }
}

async function deleteAccount(openid, accountId) {
  if (!accountId) return { success: false, error: '缺少 accountId' }
  try {
    const doc = await db.collection('accounts').doc(accountId).get()
    if (!doc.data || doc.data._openid !== openid) {
      return { success: false, error: '无权操作' }
    }
    await db.collection('accounts').doc(accountId).remove()
    return { success: true }
  } catch (e) {
    return { success: false, error: e.message }
  }
}
