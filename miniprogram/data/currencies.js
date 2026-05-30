// data/currencies.js — 支持的币种

const CURRENCIES = [
  { code: 'CNY', symbol: '¥',  name: '人民币',       flag: '🇨🇳', rate: 1 },
  { code: 'USD', symbol: '$',  name: '美元',         flag: '🇺🇸', rate: 7.25 },
  { code: 'EUR', symbol: '€',  name: '欧元',         flag: '🇪🇺', rate: 7.85 },
  { code: 'JPY', symbol: '¥',  name: '日元',         flag: '🇯🇵', rate: 0.048 },
  { code: 'GBP', symbol: '£',  name: '英镑',         flag: '🇬🇧', rate: 9.20 },
  { code: 'HKD', symbol: 'HK$', name: '港币',        flag: '🇭🇰', rate: 0.93 },
  { code: 'KRW', symbol: '₩',  name: '韩元',         flag: '🇰🇷', rate: 0.0053 },
  { code: 'THB', symbol: '฿',  name: '泰铢',         flag: '🇹🇭', rate: 0.21 },
  { code: 'SGD', symbol: 'S$', name: '新加坡元',      flag: '🇸🇬', rate: 5.45 },
  { code: 'AUD', symbol: 'A$', name: '澳元',         flag: '🇦🇺', rate: 4.70 },
  { code: 'CAD', symbol: 'C$', name: '加元',         flag: '🇨🇦', rate: 5.30 },
  { code: 'TWD', symbol: 'NT$', name: '新台币',       flag: '🇹🇼', rate: 0.23 },
  { code: 'NZD', symbol: 'NZ$', name: '新西兰元',      flag: '🇳🇿', rate: 4.35 },
  { code: 'VND', symbol: '₫',  name: '越南盾',        flag: '🇻🇳', rate: 0.000287 },
  { code: 'IDR', symbol: 'Rp', name: '印尼盾',        flag: '🇮🇩', rate: 0.000456 },
  { code: 'MYR', symbol: 'RM', name: '马来西亚林吉特', flag: '🇲🇾', rate: 1.54 },
  { code: 'PHP', symbol: '₱',  name: '菲律宾比索',     flag: '🇵🇭', rate: 0.13 },
  { code: 'INR', symbol: '₹',  name: '印度卢比',       flag: '🇮🇳', rate: 0.086 },
  { code: 'RUB', symbol: '₽',  name: '俄罗斯卢布',     flag: '🇷🇺', rate: 0.083 },
  { code: 'BRL', symbol: 'R$', name: '巴西雷亚尔',     flag: '🇧🇷', rate: 1.30 },
  { code: 'MXN', symbol: 'MX$', name: '墨西哥比索',    flag: '🇲🇽', rate: 0.38 },
  { code: 'CHF', symbol: 'Fr', name: '瑞士法郎',       flag: '🇨🇭', rate: 8.25 },
]

/**
 * 获取币种信息
 */
function getCurrency(code) {
  return CURRENCIES.find(c => c.code === (code || 'CNY')) || CURRENCIES[0]
}

/**
 * 换算成人民币（分）
 * @param {number} amount 原始金额（分）
 * @param {string} currency 币种代码
 * @param {number} customRate 自定义汇率（可选，覆盖默认）
 * @returns {number} 人民币金额（分）
 */
function toCNY(amount, currency, customRate) {
  if (currency === 'CNY' || !currency) return amount
  const info = getCurrency(currency)
  const rate = customRate || info.rate
  // amount 是外币分，rate 是 1外币=rate元人民币
  // 分 * rate = 人民币分（因为分*元/元=分）
  // 用字符串避免浮点精度丢失
  const result = Math.round(amount * rate)
  // 安全兜底：结果不能为0（除非原始金额为0）
  if (result === 0 && amount > 0) {
    // 低币值小额：用元为单位重算
    const yuanAmount = amount / 100
    return Math.round(yuanAmount * rate * 100)
  }
  return result
}

/**
 * 获取所有币种
 */
function getAllCurrencies() {
  return CURRENCIES
}

/**
 * 缓存汇率到本地（可从API更新）
 */
function saveRates(rates) {
  try {
    wx.setStorageSync('exchange_rates', { rates, updatedAt: Date.now() })
  } catch (e) {}
}

function loadRates() {
  try {
    return wx.getStorageSync('exchange_rates')
  } catch (e) {
    return null
  }
}

module.exports = {
  CURRENCIES,
  getCurrency,
  toCNY,
  getAllCurrencies,
  saveRates,
  loadRates
}
