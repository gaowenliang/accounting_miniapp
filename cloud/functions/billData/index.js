// cloud/functions/billData/index.js — 账单 CRUD + 统计

const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext()
  const { action } = event

  switch (action) {
    case 'addBill':
      return addBill(OPENID, event.data)
    case 'getRecentBills':
      return getRecentBills(OPENID, event.limit || 100)
    case 'getBillsByMonth':
      return getBillsByMonth(OPENID, event.year, event.month)
    case 'getMonthStats':
      return getMonthStats(OPENID, event.year, event.month)
    case 'deleteBill':
      return deleteBill(OPENID, event.billId)
    default:
      return { success: false, error: 'Unknown action' }
  }
}

async function addBill(openid, data) {
  // 参数校验
  if (!data || !data.amount || !data.type || !data.category) {
    return { success: false, error: '参数不完整' }
  }
  if (data.amount <= 0 || data.amount > 99999999) {
    return { success: false, error: '金额不合法' }
  }
  if (!['income', 'expense'].includes(data.type)) {
    return { success: false, error: '类型不合法' }
  }

  try {
    const result = await db.collection('bills').add({
      data: {
        _openid: openid,
        amount: data.amount,
        type: data.type,
        category: data.category,
        note: data.note || '',
        account: data.account || 'wechat',
        date: data.date || Date.now(),
        createdAt: Date.now()
      }
    })
    return { success: true, _id: result._id }
  } catch (e) {
    return { success: false, error: e.message }
  }
}

async function getRecentBills(openid, limit) {
  try {
    const result = await db.collection('bills')
      .where({ _openid: openid })
      .orderBy('date', 'desc')
      .limit(Math.min(limit, 100))
      .get()
    return { success: true, data: result.data }
  } catch (e) {
    return { success: false, error: e.message }
  }
}

async function getBillsByMonth(openid, year, month) {
  const start = new Date(year, month, 1).getTime()
  const end = new Date(year, month + 1, 0, 23, 59, 59, 999).getTime()

  try {
    const result = await db.collection('bills')
      .where({
        _openid: openid,
        date: _.gte(start).and(_.lte(end))
      })
      .orderBy('date', 'desc')
      .limit(1000)
      .get()
    return { success: true, data: result.data }
  } catch (e) {
    return { success: false, error: e.message }
  }
}

async function getMonthStats(openid, year, month) {
  const bills = (await getBillsByMonth(openid, year, month)).data || []
  let totalIncome = 0, totalExpense = 0
  const categoryStats = {}

  bills.forEach(b => {
    if (b.type === 'income') totalIncome += b.amount
    else {
      totalExpense += b.amount
      if (!categoryStats[b.category]) categoryStats[b.category] = { amount: 0, count: 0 }
      categoryStats[b.category].amount += b.amount
      categoryStats[b.category].count += 1
    }
  })

  return {
    success: true,
    data: { totalIncome, totalExpense, balance: totalIncome - totalExpense, billCount: bills.length, categoryStats }
  }
}

async function deleteBill(openid, billId) {
  try {
    await db.collection('bills').doc(billId).remove()
    return { success: true }
  } catch (e) {
    return { success: false, error: e.message }
  }
}
