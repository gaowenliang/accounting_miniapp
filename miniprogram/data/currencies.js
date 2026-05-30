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
  // 原始金额(分) / 100 → 元 × 汇率 → 人民币元 × 100 → 分
  return Math.round(amount / 100 * rate * 100)
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
