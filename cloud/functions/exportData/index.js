// cloud/functions/exportData/index.js — 导出 CSV

const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command
const { checkRateLimit } = require('./rateLimit')

// 分类映射表
const CATEGORIES = {
  food: '餐饮', transport: '交通', shopping: '购物', housing: '住房',
  entertainment: '娱乐', telecom: '通讯', medical: '医疗', education: '教育',
  clothing: '服饰', travel: '旅行', gift: '人情', pet: '宠物', other: '其他',
  salary: '工资', bonus: '奖金', invest: '投资', redpacket: '红包', freelance: '兼职'
}

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext()
  const { action } = event

  // 导出防刷
  if (!checkRateLimit(OPENID, 10)) {
    return { success: false, error: '导出太频繁，请稍后再试' }
  }

  switch (action) {
    case 'csv':
      return exportCSV(OPENID, event.year, event.month)
    case 'yearlyCSV':
      return exportYearlyCSV(OPENID, event.year)
    default:
      return { success: false, error: 'Unknown action' }
  }
}

async function fetchAllBills(openid, start, end) {
  let allData = []
  let skip = 0
  let batch
  do {
    batch = await db.collection('bills')
      .where({
        _openid: openid,
        date: _.gte(start).and(_.lte(end))
      })
      .orderBy('date', 'desc')
      .skip(skip)
      .limit(100)
      .get()
    allData = allData.concat(batch.data)
    skip += 100
  } while (batch.data.length === 100)
  return allData
}

function billsToCSV(bills) {
  const header = '日期,类型,分类,金额(元),币种,汇率,人民币等值(元),备注,账户,付款人\n'
  const rows = bills.map(b => {
    const date = new Date(b.date)
    const dateStr = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`
    const type = b.type === 'income' ? '收入' : '支出'
    const cat = CATEGORIES[b.category] || b.category
    const amount = (b.amount / 100).toFixed(2)
    const currency = b.currency || 'CNY'
    const rate = b.exchangeRate || 1
    const amountCNY = b.amountCNY ? (b.amountCNY / 100).toFixed(2) : amount
    let note = (b.note || '').replace(/,/g, '，').replace(/\n/g, ' ')
    if (/^[=+@-]/.test(note)) note = "'" + note
    const account = b.account || ''
    const payer = b.payer || ''
    return `${dateStr},${type},${cat},${amount},${currency},${rate},${amountCNY},${note},${account},${payer}`
  }).join('\n')
  return header + rows
}

async function exportCSV(openid, year, month) {
  if (!year || !month) return { success: false, error: '缺少年月' }
  // month 是 1-indexed
  const start = new Date(year, month - 1, 1).getTime()
  const end = new Date(year, month, 0, 23, 59, 59, 999).getTime()

  try {
    const bills = await fetchAllBills(openid, start, end)
    if (bills.length === 0) return { success: false, error: '没有数据' }
    const csv = billsToCSV(bills)
    return { success: true, csv, count: bills.length }
  } catch (e) {
    return { success: false, error: e.message }
  }
}

async function exportYearlyCSV(openid, year) {
  if (!year) return { success: false, error: '缺少年份' }
  const start = new Date(year, 0, 1).getTime()
  const end = new Date(year, 11, 31, 23, 59, 59, 999).getTime()

  try {
    const bills = await fetchAllBills(openid, start, end)
    if (bills.length === 0) return { success: false, error: '没有数据' }
    const csv = billsToCSV(bills)
    return { success: true, csv, count: bills.length }
  } catch (e) {
    return { success: false, error: e.message }
  }
}
