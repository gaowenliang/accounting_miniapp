// data/currencies.js — 支持的币种
// 汇率模式：
//   mode='direct':  1外币 = rate元人民币（高币值：USD/EUR/GBP...）
//   mode='inverse': 1元人民币 = rate外币（低币值：JPY/KRW/VND...）

const CURRENCIES = [
  // ===== 高币值：1外币 = rate CNY =====
  { code: 'CNY', symbol: '¥',   name: '人民币',         flag: '🇨🇳', rate: 1,      mode: 'direct' },
  { code: 'USD', symbol: '$',   name: '美元',           flag: '🇺🇸', rate: 7.25,   mode: 'direct' },
  { code: 'EUR', symbol: '€',   name: '欧元',           flag: '🇪🇺', rate: 7.85,   mode: 'direct' },
  { code: 'GBP', symbol: '£',   name: '英镑',           flag: '🇬🇧', rate: 9.20,   mode: 'direct' },
  { code: 'CHF', symbol: 'Fr',  name: '瑞士法郎',       flag: '🇨🇭', rate: 8.25,   mode: 'direct' },
  { code: 'SGD', symbol: 'S$',  name: '新加坡元',       flag: '🇸🇬', rate: 5.45,   mode: 'direct' },
  { code: 'AUD', symbol: 'A$',  name: '澳元',           flag: '🇦🇺', rate: 4.70,   mode: 'direct' },
  { code: 'CAD', symbol: 'C$',  name: '加元',           flag: '🇨🇦', rate: 5.30,   mode: 'direct' },
  { code: 'NZD', symbol: 'NZ$', name: '新西兰元',       flag: '🇳🇿', rate: 4.35,   mode: 'direct' },
  { code: 'HKD', symbol: 'HK$', name: '港币',           flag: '🇭🇰', rate: 0.93,   mode: 'direct' },
  { code: 'MYR', symbol: 'RM',  name: '马来西亚林吉特', flag: '🇲🇾', rate: 1.54,   mode: 'direct' },
  { code: 'BRL', symbol: 'R$',  name: '巴西雷亚尔',     flag: '🇧🇷', rate: 1.30,   mode: 'direct' },
  // ===== 低币值：1 CNY = rate 外币 =====
  { code: 'JPY', symbol: '¥',   name: '日元',           flag: '🇯🇵', rate: 20.83,  mode: 'inverse' },
  { code: 'KRW', symbol: '₩',   name: '韩元',           flag: '🇰🇷', rate: 188.68, mode: 'inverse' },
  { code: 'TWD', symbol: 'NT$', name: '新台币',         flag: '🇹🇼', rate: 4.35,   mode: 'inverse' },
  { code: 'THB', symbol: '฿',   name: '泰铢',           flag: '🇹🇭', rate: 4.76,   mode: 'inverse' },
  { code: 'PHP', symbol: '₱',   name: '菲律宾比索',     flag: '🇵🇭', rate: 7.69,   mode: 'inverse' },
  { code: 'INR', symbol: '₹',   name: '印度卢比',       flag: '🇮🇳', rate: 11.63,  mode: 'inverse' },
  { code: 'RUB', symbol: '₽',   name: '俄罗斯卢布',     flag: '🇷🇺', rate: 12.05,  mode: 'inverse' },
  { code: 'MXN', symbol: 'MX$', name: '墨西哥比索',     flag: '🇲🇽', rate: 2.63,   mode: 'inverse' },
  { code: 'VND', symbol: '₫',   name: '越南盾',         flag: '🇻🇳', rate: 3484.3, mode: 'inverse' },
  { code: 'IDR', symbol: 'Rp',  name: '印尼盾',         flag: '🇮🇩', rate: 2192.9, mode: 'inverse' },
]

/**
 * 获取币种信息
 */
function getCurrency(code) {
  return CURRENCIES.find(c => c.code === (code || 'CNY')) || CURRENCIES[0]
}

/**
 * 换算成人民币（分）
 * @param {number} amount 原始金额（外币分）
 * @param {string} currency 币种代码
 * @param {number} customRate 自定义汇率（可选）
 * @param {string} customMode 汇率模式（可选）
 * @returns {number} 人民币金额（分）
 */
function toCNY(amount, currency, customRate, customMode) {
  if (currency === 'CNY' || !currency) return amount
  const info = getCurrency(currency)
  const rate = customRate || info.rate
  const mode = customMode || info.mode

  if (mode === 'direct') {
    // 1外币 = rate元人民币 → amount(分) * rate = 人民币分
    return Math.round(amount * rate)
  } else {
    // 1元人民币 = rate外币 → amount(分) / rate = 人民币分
    return Math.round(amount / rate)
  }
}

/**
 * 获取汇率显示文本
 */
function getRateDisplay(currencyCode) {
  if (currencyCode === 'CNY') return ''
  const info = getCurrency(currencyCode)
  if (info.mode === 'direct') {
    return `1 ${info.code} = ${info.rate} CNY`
  } else {
    return `1 CNY = ${info.rate} ${info.code}`
  }
}

function getAllCurrencies() {
  // 读取用户自定义排序
  let customOrder = null
  try { customOrder = wx.getStorageSync('currency_order') } catch (e) {}
  if (!customOrder || !Array.isArray(customOrder)) return CURRENCIES
  // 按自定义顺序排列，新币种追加到末尾
  const ordered = []
  const seen = new Set()
  customOrder.forEach(code => {
    const c = CURRENCIES.find(item => item.code === code)
    if (c) { ordered.push(c); seen.add(code) }
  })
  CURRENCIES.forEach(c => { if (!seen.has(c.code)) ordered.push(c) })
  return ordered
}

function saveCurrencyOrder(codes) {
  try { wx.setStorageSync('currency_order', codes) } catch (e) {}
}

function saveRates(rates) {
  try { wx.setStorageSync('exchange_rates', { rates, updatedAt: Date.now() }) } catch (e) {}
}

function loadRates() {
  try { return wx.getStorageSync('exchange_rates') } catch (e) { return null }
}

module.exports = {
  CURRENCIES, getCurrency, toCNY, getAllCurrencies,
  getRateDisplay, saveRates, loadRates, saveCurrencyOrder
}
