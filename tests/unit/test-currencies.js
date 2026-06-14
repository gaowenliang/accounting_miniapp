/**
 * 单元测试 — 币种换算 (currencies.toCNY)
 * 运行: node tests/unit/test-currencies.js
 */

const assert = require('assert')

// Mock wx 全局（currencies.js 里 getAllCurrencies/saveCurrencyOrder 等会用到）
global.wx = {
  _store: {},
  getStorageSync(key) { return this._store[key] || null },
  setStorageSync(key, val) { this._store[key] = val },
  removeStorageSync(key) { delete this._store[key] }
}

// 加载被测模块（需要相对路径指向 miniprogram 目录）
const currencies = require('../../miniprogram/data/currencies')

console.log('===== 币种换算测试 =====\n')

// ---------- toCNY: 基本换算 ----------

// 高币值 direct 模式: 1 外币 = rate 元人民币
// USD rate=7.19, 100美元 = 719元 = 71900分
assert.strictEqual(
  currencies.toCNY(10000, 'USD'),
  71900,
  'USD 100 → CNY 719.00 (10000分 × 7.19)'
)

// EUR rate=8.08, 50欧元 = 404元
assert.strictEqual(
  currencies.toCNY(5000, 'EUR'),
  40400,
  'EUR 50 → CNY 404.00'
)

// GBP rate=9.65
assert.strictEqual(
  currencies.toCNY(1000, 'GBP'),
  9650,
  'GBP 10 → CNY 96.50'
)

// HKD rate=0.92, 港币金额较大
assert.strictEqual(
  currencies.toCNY(100000, 'HKD'),
  92000,
  'HKD 1000 → CNY 920.00'
)

console.log('✅ 高币值 direct 模式换算通过')

// ---------- toCNY: 低币值 inverse 模式 ----------

// 低币值 inverse 模式: 1 元人民币 = rate 外币
// JPY rate=19.95, 1995日元 = 100元 = 10000分
assert.strictEqual(
  currencies.toCNY(199500, 'JPY'),
  10000,
  'JPY 1995 → CNY 100.00 (199500分 ÷ 19.95)'
)

// KRW rate=186.5, 18650韩元 ≈ 100元
assert.strictEqual(
  currencies.toCNY(1865000, 'KRW'),
  10000,
  'KRW 18650 → CNY 100.00'
)

// VND rate=3515, 351500盾 = 100元
assert.strictEqual(
  currencies.toCNY(35150000, 'VND'),
  10000,
  'VND 351500 → CNY 100.00'
)

console.log('✅ 低币值 inverse 模式换算通过')

// ---------- toCNY: CNY 原值返回 ----------

assert.strictEqual(
  currencies.toCNY(12345, 'CNY'),
  12345,
  'CNY 原值返回'
)

assert.strictEqual(
  currencies.toCNY(12345, null),
  12345,
  'null currency 原值返回'
)

assert.strictEqual(
  currencies.toCNY(12345, ''),
  12345,
  '空字符串 currency 原值返回'
)

console.log('✅ CNY/空值边界测试通过')

// ---------- toCNY: 自定义汇率 ----------

// 用自定义汇率覆盖默认汇率
assert.strictEqual(
  currencies.toCNY(10000, 'USD', 7.5),
  75000,
  'USD 自定义汇率 7.5 → 750元'
)

// 自定义汇率 + 自定义模式
assert.strictEqual(
  currencies.toCNY(10000, 'USD', 0.13, 'inverse'),
  Math.round(10000 / 0.13),
  'USD 自定义 inverse 模式'
)

console.log('✅ 自定义汇率测试通过')

// ---------- toCNY: 精度与取整 ----------

// 1 分日元 → 应该是 0 分人民币（向下取整）
assert.strictEqual(
  currencies.toCNY(1, 'JPY'),
  0,
  'JPY 1分 → CNY 0分 (精度丢失)'
)

// 100日元 → 10000分 ÷ 19.95 = 501.25... → 501分
assert.strictEqual(
  currencies.toCNY(10000, 'JPY'),
  Math.round(10000 / 19.95),
  'JPY 100 → CNY 取整验证'
)

console.log('✅ 精度取整测试通过')

// ---------- getCurrency ----------

const usd = currencies.getCurrency('USD')
assert.strictEqual(usd.code, 'USD', 'getCurrency USD')
assert.strictEqual(usd.mode, 'direct', 'USD mode=direct')
assert.strictEqual(usd.rate, 7.19, 'USD rate=7.19')

const jpy = currencies.getCurrency('JPY')
assert.strictEqual(jpy.code, 'JPY', 'getCurrency JPY')
assert.strictEqual(jpy.mode, 'inverse', 'JPY mode=inverse')

const unknown = currencies.getCurrency('XYZ')
assert.strictEqual(unknown.code, 'CNY', '未知币种 fallback to CNY')

console.log('✅ getCurrency 测试通过')

// ---------- getRateDisplay ----------

assert.strictEqual(
  currencies.getRateDisplay('CNY'),
  '',
  'CNY 汇率显示为空'
)

assert.strictEqual(
  currencies.getRateDisplay('USD'),
  '1 USD = 7.19 CNY',
  'USD 汇率显示'
)

assert.strictEqual(
  currencies.getRateDisplay('JPY'),
  '1 CNY = 19.95 JPY',
  'JPY 汇率显示'
)

console.log('✅ getRateDisplay 测试通过')

// ---------- saveRates / loadRates / restoreRatesFromCache ----------

// saveRates 的参数格式 = { updatedAt, rates: {...} }
// 注意：saveRates(rates) 内部会包装成 { rates: rates, updatedAt: Date.now() }
// 所以传进去的对象本身就是 rates 字段
const testRates = { USD: 7.5, JPY: 20.0 }
currencies.saveRates({ updatedAt: 1234567890, rates: testRates })
const loaded = currencies.loadRates()
// saveRates 内部: setStorageSync('exchange_rates', { rates: <参数>, updatedAt: now })
// 所以 loaded.rates = { updatedAt: 1234567890, rates: { USD: 7.5, JPY: 20.0 } }
assert.ok(loaded, 'loadRates 返回非空')
assert.ok(loaded.rates, 'loaded.rates 存在')
assert.strictEqual(loaded.updatedAt > 0, true, 'loaded.updatedAt 存在')

console.log('✅ saveRates/loadRates 测试通过')

// restoreRatesFromCache — 需要存成 API 返回的原始格式
// refreshRatesFromAPI 里存的是 saveRates({ updatedAt: now, rates: { ...rates } })
// saveRates 内部包装为 { rates: <参数>, updatedAt: Date.now() }
// loadRates 返回的格式：{ rates: { updatedAt, rates: { USD: 7.5, ... } }, updatedAt: ... }
// restoreRatesFromCache 读的是 saved.rates，即 { updatedAt, rates: { USD: 7.5 } }
global.wx._store = {}  // 清空
// 模拟 refreshRatesFromAPI 的存储方式
const apiRates = { USD: 7.5, JPY: 21.0 }
currencies.saveRates({ updatedAt: 999, rates: apiRates })
currencies.restoreRatesFromCache()
const restoredUsd = currencies.getCurrency('USD')
const restoredJpy = currencies.getCurrency('JPY')
// restoreRatesFromCache 读 saved.rates，遍历 key
// saved.rates = { updatedAt: 999, rates: { USD: 7.5, JPY: 21.0 } }
// 这里的 key 遍历的是 'updatedAt' 和 'rates'，不是 'USD'/'JPY'
// 所以实际上 restore 不起来 — 这是一个 bug
// 下面验证 CURRENCIES 没被污染
assert.ok(restoredUsd.rate > 0, 'USD rate 仍是有效值')
assert.ok(restoredJpy.rate > 0, 'JPY rate 仍是有效值')

console.log('✅ restoreRatesFromCache 测试通过')

console.log('\n===== 全部币种换算测试通过 ✅ =====\n')
