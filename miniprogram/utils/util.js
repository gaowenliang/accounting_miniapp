// utils/util.js — 通用工具函数

/**
 * 格式化金额（分→元，带千分位）
 * @param {number} fen 金额（分）
 * @param {boolean} showSign 是否显示正负号
 */
function formatMoney(fen, showSign = false, symbol = '¥') {
  const yuan = fen / 100
  const formatted = Math.abs(yuan).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })
  if (showSign) {
    return fen >= 0 ? `+${symbol}${formatted}` : `-${symbol}${formatted}`
  }
  return `${symbol}${formatted}`
}

/**
 * 格式化日期 YYYY-MM-DD
 */
function formatDate(date) {
  const d = new Date(date)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * 格式化时间 HH:mm
 */
function formatTime(date) {
  const d = new Date(date)
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0')
}

/**
 * 格式化为友好时间
 */
function timeAgo(date) {
  const now = Date.now()
  const diff = now - new Date(date).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes}分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}小时前`
  const days = Math.floor(hours / 24)
  if (days === 1) return '昨天'
  if (days < 7) return `${days}天前`
  return formatDate(date)
}

/**
 * 判断是否同一天
 */
function isSameDay(d1, d2) {
  const a = new Date(d1), b = new Date(d2)
  return a.getFullYear() === b.getFullYear() &&
         a.getMonth() === b.getMonth() &&
         a.getDate() === b.getDate()
}

/**
 * 判断是否同一个月
 */
function isSameMonth(d1, d2) {
  const a = new Date(d1), b = new Date(d2)
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()
}

/**
 * 获取某月第一天 0点时间戳
 * @param {number} year  年份
 * @param {number} month 月份 1-12
 */
function monthStart(year, month) {
  return new Date(year, month - 1, 1).getTime()
}

/**
 * 获取某月最后一天 23:59:59 时间戳
 * @param {number} year  年份
 * @param {number} month 月份 1-12
 */
function monthEnd(year, month) {
  return new Date(year, month, 0, 23, 59, 59, 999).getTime()
}

/**
 * 生成唯一ID
 */
let _idCounter = 0
function genId() {
  _idCounter = (_idCounter + 1) % 1000000
  const rand = Math.floor(Math.random() * 0xFFFF).toString(36)
  return 'b_' + Date.now().toString(36) + '_' + _idCounter.toString(36) + '_' + rand
}

/**
 * 获取今天 0 点时间戳
 */
function todayStart() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/**
 * 元转分（避免浮点问题）
 */
function yuanToFen(yuan) {
  return Math.round(yuan * 100)
}

/**
 * 分转元
 */
function fenToYuan(fen) {
  return fen / 100
}

/**
 * 生成 CSV 字符串（带 BOM 头，Excel 兼容）
 * @param {Array} bills 账单列表
 * @param {Array} members 成员列表（可选）
 * @param {Object} categoriesModule categories 模块（可选，用于查分类名）
 * @returns {string} CSV 字符串
 */
function billsToCSV(bills, members, categoriesModule) {
  const catMod = categoriesModule || require('../data/categories')
  const memberMap = new Map((members || []).map(m => [m.id, m]))
  let csv = '\uFEFF'  // BOM 头
  csv += '日期,类型,分类,金额(元),币种,汇率,人民币等值(元),备注,账户,付款人,收据\n'
  bills.forEach(b => {
    const cat = catMod.getCategoryBy(b.category, b.type)
    const payer = memberMap.get(b.payer || 'self')
    // CSV 注入防护
    let note = b.note || ''
    if (/^[=+@\-]/.test(note)) note = "'" + note
    const rate = b.exchangeRate || 1
    const amountCNY = b.amountCNY || b.amount
    csv += `${formatDate(b.date)},${b.type === 'income' ? '收入' : '支出'},${cat.name},${(b.amount/100).toFixed(2)},${b.currency || 'CNY'},${rate},${(amountCNY/100).toFixed(2)},${note},${b.account},${payer ? payer.name : '我'},${b.receipt ? '有' : ''}\n`
  })
  return csv
}

module.exports = {
  formatMoney,
  formatDate,
  formatTime,
  timeAgo,
  isSameDay,
  isSameMonth,
  monthStart,
  monthEnd,
  genId,
  todayStart,
  yuanToFen,
  fenToYuan,
  billsToCSV
}
