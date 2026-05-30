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
      return addBill(OPENID, event.data, event.ledgerId)
    case 'getRecentBills':
      return getRecentBills(OPENID, event.limit || 100)
    case 'getBillsByMonth':
      return getBillsByMonth(OPENID, event.year, event.month)
    case 'getMonthStats':
      return getMonthStats(OPENID, event.year, event.month)
    case 'deleteBill':
      return deleteBill(OPENID, event.billId)
    // 账本相关
    case 'createLedger':
      return createLedger(OPENID, event.data)
    case 'joinLedger':
      return joinLedger(OPENID, event.inviteCode)
    case 'leaveLedger':
      return leaveLedger(OPENID, event.ledgerId)
    case 'getLedgerBills':
      return getLedgerBills(OPENID, event.ledgerId, event.limit || 200)
    default:
      return { success: false, error: 'Unknown action' }
  }
}

async function addBill(openid, data, ledgerId) {
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
    const collection = ledgerId ? 'ledger_bills' : 'bills'
    const doc = {
      _openid: openid,
      amount: data.amount,
        type: data.type,
        category: data.category,
        note: data.note || '',
        account: data.account || 'wechat',
        date: data.date || Date.now(),
        createdAt: Date.now()
    }
    if (ledgerId) doc.ledgerId = ledgerId
    const result = await db.collection(collection).add({ data: doc })
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

// ========== 账本系统 ==========

async function createLedger(openid, data) {
  if (!data || !data.name) return { success: false, error: '缺少名称' }
  const inviteCode = String(Math.floor(100000 + Math.random() * 900000))
  try {
    const result = await db.collection('ledgers').add({
      data: {
        _openid: openid,
        name: data.name,
        icon: data.icon || '📒',
        inviteCode,
        memberCount: 1,
        createdAt: Date.now()
      }
    })
    // 创建者自动加入成员表
    await db.collection('ledger_members').add({
      data: {
        ledgerId: result._id,
        _openid: openid,
        role: 'owner',
        joinedAt: Date.now()
      }
    })
    return { success: true, _id: result._id, inviteCode }
  } catch (e) {
    return { success: false, error: e.message }
  }
}

async function joinLedger(openid, inviteCode) {
  if (!inviteCode || inviteCode.length !== 6) {
    return { success: false, reason: '邀请码格式不对' }
  }
  try {
    // 查找账本
    const ledgerRes = await db.collection('ledgers')
      .where({ inviteCode })
      .limit(1).get()
    if (ledgerRes.data.length === 0) {
      return { success: false, reason: '邀请码无效' }
    }
    const target = ledgerRes.data[0]
    // 检查是否已加入
    const memberRes = await db.collection('ledger_members')
      .where({ ledgerId: target._id, _openid: openid })
      .limit(1).get()
    if (memberRes.data.length > 0) {
      return { success: false, reason: '你已经在这个账本里了' }
    }
    // 加入
    await db.collection('ledger_members').add({
      data: {
        ledgerId: target._id,
        _openid: openid,
        role: 'member',
        joinedAt: Date.now()
      }
    })
    // 更新成员数
    await db.collection('ledgers').doc(target._id).update({
      data: { memberCount: _.inc(1) }
    })
    return {
      success: true,
      data: {
        _id: target._id,
        name: target.name,
        icon: target.icon,
        inviteCode: target.inviteCode,
        createdAt: target.createdAt,
        memberCount: (target.memberCount || 1) + 1
      }
    }
  } catch (e) {
    return { success: false, reason: '网络错误' }
  }
}

async function leaveLedger(openid, ledgerId) {
  try {
    // 删除成员记录
    const memberRes = await db.collection('ledger_members')
      .where({ ledgerId, _openid: openid })
      .limit(1).get()
    if (memberRes.data.length > 0) {
      await db.collection('ledger_members').doc(memberRes.data[0]._id).remove()
      await db.collection('ledgers').doc(ledgerId).update({
        data: { memberCount: _.inc(-1) }
      })
    }
    return { success: true }
  } catch (e) {
    return { success: false, error: e.message }
  }
}

async function getLedgerBills(openid, ledgerId, limit) {
  try {
    // 先检查是否是成员
    const memberRes = await db.collection('ledger_members')
      .where({ ledgerId, _openid: openid })
      .limit(1).get()
    if (memberRes.data.length === 0) {
      return { success: false, error: '无权访问' }
    }
    const result = await db.collection('ledger_bills')
      .where({ ledgerId })
      .orderBy('date', 'desc')
      .limit(Math.min(limit, 500))
      .get()
    return { success: true, data: result.data }
  } catch (e) {
    return { success: false, error: e.message }
  }
}
