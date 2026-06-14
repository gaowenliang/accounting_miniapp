// cloud/functions/billData/index.js — 账单 CRUD + 统计 + 账本

const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

// 防刷：公共模块
const { checkRateLimit } = require('./rateLimit')

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext()
  const { action } = event

  // 写操作加防刷
  if (['addBill', 'deleteBill', 'createLedger', 'joinLedger', 'leaveLedger'].includes(action)) {
    if (!checkRateLimit(OPENID)) {
      return { success: false, error: '操作太频繁，请稍后再试' }
    }
  }

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
      return deleteBill(OPENID, event.billId, event.ledgerId)
    // 账本相关
    case 'createLedger':
      return createLedger(OPENID, event.data)
    case 'joinLedger':
      return joinLedger(OPENID, event.inviteCode)
    case 'leaveLedger':
      return leaveLedger(OPENID, event.ledgerId)
    case 'getLedgerBills':
      return getLedgerBills(OPENID, event.ledgerId, event.limit || 200, event.startTime, event.endTime)
    case 'getLedgerMembers':
      return getLedgerMembers(OPENID, event.ledgerId)
    case 'removeLedgerMember':
      return removeLedgerMember(OPENID, event.ledgerId, event.memberId)
    default:
      return { success: false, error: 'Unknown action' }
  }
}

// ========== 账单 CRUD ==========

async function addBill(openid, data, ledgerId) {
  // 参数校验
  if (!data || !data.amount || !data.type || !data.category) {
    return { success: false, error: '参数不完整' }
  }
  if (data.amount <= 0 || data.amount > 99999999) {
    return { success: false, error: '金额不合法' }
  }
  if (!['income', 'expense', 'transfer'].includes(data.type)) {
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
      payer: data.payer || 'self',
      createdAt: Date.now(),
      createdBy: openid
    }
    // 可选字段
    if (data.splits && data.splits.length > 0) doc.splits = data.splits
    if (data.targetAccount) doc.targetAccount = data.targetAccount
    if (data.tags && data.tags.length > 0) doc.tags = data.tags
    if (ledgerId) doc.ledgerId = ledgerId
    // 外币
    if (data.currency && data.currency !== 'CNY') {
      doc.currency = data.currency
      doc.exchangeRate = data.exchangeRate || 1
      doc.amountCNY = data.amountCNY || data.amount
    }

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

/**
 * getBillsByMonth — month 参数为 1-indexed (1-12)
 * 微信云函数单次最多 100 条，需要循环拉取
 */
async function getBillsByMonth(openid, year, month) {
  // month 是 1-indexed，JS Date 需要 0-indexed
  const start = new Date(year, month - 1, 1).getTime()
  const end = new Date(year, month, 0, 23, 59, 59, 999).getTime()

  try {
    const MAX = 3000
    const MAX_SKIP = 1000  // skip 超过 1000 后微信云数据库性能急剧下降
    let allData = []
    let batch
    let skip = 0
    const BATCH_SIZE = 100

    do {
      batch = await db.collection('bills')
        .where({
          _openid: openid,
          date: _.gte(start).and(_.lte(end))
        })
        .orderBy('date', 'desc')
        .skip(skip)
        .limit(BATCH_SIZE)
        .get()
      allData = allData.concat(batch.data)
      skip += BATCH_SIZE
    } while (batch.data.length === BATCH_SIZE && allData.length < MAX && skip <= MAX_SKIP)

    return { success: true, data: allData }
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

/**
 * P0-2 修复：删除前验证所有权
 */
async function deleteBill(openid, billId, ledgerId) {
  if (!billId) return { success: false, error: '缺少 billId' }
  try {
    const collection = ledgerId ? 'ledger_bills' : 'bills'
    // 先查再删，验证所有权
    const doc = await db.collection(collection).doc(billId).get()
    if (!doc.data || doc.data._openid !== openid) {
      return { success: false, error: '无权删除' }
    }
    await db.collection(collection).doc(billId).remove()
    return { success: true }
  } catch (e) {
    return { success: false, error: e.message }
  }
}

// ========== 账本系统 ==========

async function createLedger(openid, data) {
  if (!data || !data.name) return { success: false, error: '缺少名称' }
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const inviteEnabled = data.inviteEnabled !== false  // 默认开启

  let inviteCode = ''

  if (!inviteEnabled) {
    // 关闭邀请码，用空字符串标记
    inviteCode = '__DISABLED__'
  } else if (data.customInviteCode) {
    // 自定义邀请码，校验格式 + 唯一性
    const code = data.customInviteCode.toUpperCase()
    if (!/^[A-Z0-9]{6}$/.test(code)) {
      return { success: false, error: '邀请码需6位大写字母或数字' }
    }
    const existing = await db.collection('ledgers').where({ inviteCode: code }).limit(1).count()
    if (existing.total > 0) {
      return { success: false, error: '该邀请码已被使用' }
    }
    inviteCode = code
  } else {
    // 自动生成唯一邀请码（最多重试5次）
    for (let attempt = 0; attempt < 5; attempt++) {
      let code = ''
      for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)]
      const existing = await db.collection('ledgers').where({ inviteCode: code }).limit(1).count()
      if (existing.total === 0) {
        inviteCode = code
        break
      }
    }
    if (!inviteCode) return { success: false, error: '邀请码生成失败，请重试' }
  }

  try {
    const result = await db.collection('ledgers').add({
      data: {
        _openid: openid,
        name: data.name,
        icon: data.icon || '📒',
        inviteCode,
        inviteEnabled,
        memberCount: 1,
        createdAt: Date.now()
      }
    })
    await db.collection('ledger_members').add({
      data: {
        ledgerId: result._id,
        _openid: openid,
        role: 'owner',
        joinedAt: Date.now()
      }
    })
    return { success: true, _id: result._id, inviteCode: inviteEnabled ? inviteCode : '' }
  } catch (e) {
    return { success: false, error: e.message }
  }
}

async function joinLedger(openid, inviteCode) {
  if (!inviteCode || inviteCode.length !== 6) {
    return { success: false, reason: '邀请码格式不对' }
  }
  try {
    const ledgerRes = await db.collection('ledgers')
      .where({ inviteCode })
      .limit(1).get()
    if (ledgerRes.data.length === 0) {
      return { success: false, reason: '邀请码无效' }
    }
    const target = ledgerRes.data[0]
    const memberRes = await db.collection('ledger_members')
      .where({ ledgerId: target._id, _openid: openid })
      .limit(1).get()
    if (memberRes.data.length > 0) {
      return { success: false, reason: '你已经在这个账本里了' }
    }
    if ((target.memberCount || 1) >= 20) {
      return { success: false, reason: '该账本已满（最多20人）' }
    }
    await db.collection('ledger_members').add({
      data: {
        ledgerId: target._id,
        _openid: openid,
        role: 'member',
        joinedAt: Date.now()
      }
    })
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
    const memberRes = await db.collection('ledger_members')
      .where({ ledgerId, _openid: openid })
      .limit(1).get()
    if (memberRes.data.length === 0) {
      return { success: false, reason: '你不在这个账本中' }
    }
    const member = memberRes.data[0]
    if (member.role === 'owner') {
      // owner 不能直接退出，需先转让或解散
      const countRes = await db.collection('ledger_members')
        .where({ ledgerId }).count()
      if (countRes.total > 1) {
        return { success: false, reason: '请先转让管理员或解散账本' }
      }
      // 最后一人且是 owner → 解散账本
      await db.collection('ledgers').doc(ledgerId).remove()
      // 循环删除 ledger_bills（微信云 where().remove() 有数量限制）
      let deletedBills = 0
      do {
        const delRes = await db.collection('ledger_bills').where({ ledgerId }).limit(100).remove()
        deletedBills = delRes.stats.removed
      } while (deletedBills > 0)
      // 循环删除 ledger_members
      let deletedMembers = 0
      do {
        const delMemRes = await db.collection('ledger_members').where({ ledgerId }).limit(100).remove()
        deletedMembers = delMemRes.stats.removed
      } while (deletedMembers > 0)
      return { success: true, dissolved: true }
    }
    await db.collection('ledger_members').doc(member._id).remove()
    await db.collection('ledgers').doc(ledgerId).update({
      data: { memberCount: _.inc(-1) }
    })
    return { success: true }
  } catch (e) {
    return { success: false, error: e.message }
  }
}

async function getLedgerBills(openid, ledgerId, limit, startTime, endTime) {
  try {
    const memberRes = await db.collection('ledger_members')
      .where({ ledgerId, _openid: openid })
      .limit(1).get()
    if (memberRes.data.length === 0) {
      return { success: false, error: '无权访问' }
    }

    // 构建查询条件
    const where = { ledgerId }
    if (startTime && endTime) {
      where.date = _.gte(startTime).and(_.lte(endTime))
    } else if (startTime) {
      where.date = _.gte(startTime)
    }

    // 循环拉取
    let allData = []
    let skip = 0
    let batch
    const BATCH_SIZE = 100
    const MAX = Math.min(limit, 2000)

    do {
      batch = await db.collection('ledger_bills')
        .where(where)
        .orderBy('date', 'desc')
        .skip(skip)
        .limit(BATCH_SIZE)
        .get()
      allData = allData.concat(batch.data)
      skip += BATCH_SIZE
    } while (batch.data.length === BATCH_SIZE && allData.length < MAX)

    return { success: true, data: allData }
  } catch (e) {
    return { success: false, error: e.message }
  }
}

// ========== 成员管理（共享账本） ==========

async function getLedgerMembers(openid, ledgerId) {
  if (!ledgerId) return { success: false, error: '缺少 ledgerId' }
  try {
    // 验证成员身份
    const memberRes = await db.collection('ledger_members')
      .where({ ledgerId, _openid: openid })
      .limit(1).get()
    if (memberRes.data.length === 0) {
      return { success: false, error: '无权访问' }
    }
    const members = await db.collection('ledger_members')
      .where({ ledgerId })
      .limit(100)
      .get()
    return { success: true, data: members.data }
  } catch (e) {
    return { success: false, error: e.message }
  }
}

async function removeLedgerMember(openid, ledgerId, memberId) {
  if (!ledgerId || !memberId) return { success: false, error: '参数不完整' }
  try {
    // 只有 owner 能踢人
    const callerRes = await db.collection('ledger_members')
      .where({ ledgerId, _openid: openid })
      .limit(1).get()
    if (callerRes.data.length === 0) return { success: false, error: '无权操作' }
    const caller = callerRes.data[0]
    if (caller.role !== 'owner') return { success: false, error: '只有管理员能移除成员' }
    // 不能踢自己（用 leaveLedger）
    const targetRes = await db.collection('ledger_members')
      .where({ ledgerId, _openid: memberId })
      .limit(1).get()
    if (targetRes.data.length === 0) return { success: false, error: '成员不存在' }
    const target = targetRes.data[0]
    if (target.role === 'owner') return { success: false, error: '不能移除管理员' }
    await db.collection('ledger_members').doc(target._id).remove()
    await db.collection('ledgers').doc(ledgerId).update({ data: { memberCount: _.inc(-1) } })
    return { success: true }
  } catch (e) {
    return { success: false, error: e.message }
  }
}
