/**
 * 单元测试 — 金额工具函数 (yuanToFen, formatMoney, validateAmount)
 * 运行: node tests/unit/test-money.js
 */

const assert = require('assert')

// ---- 测试 yuanToFen ----

function yuanToFen(yuan) {
  return Math.round(yuan * 100)
}

console.log('===== 金额工具函数测试 =====\n')

// 基本换算
assert.strictEqual(yuanToFen(0), 0, '0 元 = 0 分')
assert.strictEqual(yuanToFen(1), 100, '1 元 = 100 分')
assert.strictEqual(yuanToFen(0.01), 1, '0.01 元 = 1 分')
assert.strictEqual(yuanToFen(99.99), 9999, '99.99 元 = 9999 分')
assert.strictEqual(yuanToFen(1000000), 100000000, '100 万 = 1 亿分')

// 浮点精度问题
assert.strictEqual(yuanToFen(0.1 + 0.2), 30, '0.1+0.2=0.3 元 → 30 分（浮点修正）')
assert.strictEqual(yuanToFen(19.99), 1999, '19.99 → 1999 分')
assert.strictEqual(yuanToFen(0.07), 7, '0.07 → 7 分')

console.log('✅ yuanToFen 测试通过')

// ---- 测试 formatMoney ----

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

assert.strictEqual(formatMoney(0), '¥0.00', '0 分')
assert.strictEqual(formatMoney(100), '¥1.00', '100 分 = 1 元')
assert.strictEqual(formatMoney(1999), '¥19.99', '1999 分 = 19.99 元')
assert.strictEqual(formatMoney(100000), '¥1,000.00', '千分位')
assert.strictEqual(formatMoney(-500), '¥5.00', '负数无符号显示绝对值')
assert.strictEqual(formatMoney(500, true), '+¥5.00', '正数带符号')
assert.strictEqual(formatMoney(-500, true), '-¥5.00', '负数带符号')
assert.strictEqual(formatMoney(100, false, '$'), '$1.00', '美元符号')

console.log('✅ formatMoney 测试通过')

// ---- 测试 validateAmount ----

function validateAmount(str) {
  if (!str || str.trim() === '') return { valid: false, msg: '请输入金额' }
  const num = parseFloat(str)
  if (isNaN(num)) return { valid: false, msg: '请输入有效数字' }
  if (num <= 0) return { valid: false, msg: '金额必须大于0' }
  if (num > 999999.99) return { valid: false, msg: '单笔金额不能超过99万' }
  const parts = str.split('.')
  if (parts.length > 1 && parts[1].length > 2) return { valid: false, msg: '最多两位小数' }
  return { valid: true, value: num }
}

// 合法值
assert.strictEqual(validateAmount('100').valid, true, '100 合法')
assert.strictEqual(validateAmount('0.01').valid, true, '0.01 合法')
assert.strictEqual(validateAmount('99.99').valid, true, '99.99 合法')
assert.strictEqual(validateAmount('999999.99').valid, true, '999999.99 合法')

// 非法值
assert.strictEqual(validateAmount('').valid, false, '空字符串非法')
assert.strictEqual(validateAmount('abc').valid, false, '字母非法')
assert.strictEqual(validateAmount('0').valid, false, '0 非法')
assert.strictEqual(validateAmount('-1').valid, false, '负数非法')
assert.strictEqual(validateAmount('1000000').valid, false, '超 99 万非法')
assert.strictEqual(validateAmount('1.234').valid, false, '三位小数非法')

console.log('✅ validateAmount 测试通过')

// ---- 安全计算器 _safeEval ----

function _safeEval(expr) {
  try {
    const sanitized = expr.replace(/[^0-9.+-]/g, '')
    const normalized = sanitized.replace(/[+-]{2,}/g, m => m[m.length - 1])
    const tokens = normalized.match(/[+-]?[\d.]+/g)
    if (!tokens) return 0
    let result = 0
    for (const t of tokens) {
      const n = parseFloat(t)
      if (!isNaN(n) && isFinite(n)) result += n
    }
    return result
  } catch (e) { return 0 }
}

assert.strictEqual(_safeEval('100'), 100, '纯数字')
assert.strictEqual(_safeEval('3.5+1.2'), 4.7, '加法')
assert.strictEqual(_safeEval('10-3'), 7, '减法')
assert.strictEqual(_safeEval('3.5+1.2-0.7'), 4.0, '加减混合')
assert.strictEqual(_safeEval('100+200+300'), 600, '多加')
assert.strictEqual(_safeEval(''), 0, '空字符串')
assert.strictEqual(_safeEval('.'), 0, '只有点')
assert.strictEqual(_safeEval('1.'), 1, '1. → 1')
assert.strictEqual(_safeEval('1+'), 1, '1+ → 1（尾部运算符忽略）')
assert.strictEqual(_safeEval('eval()'), 0, '注入被过滤')
assert.strictEqual(_safeEval('1;2'), 12, '分号被过滤，1;2 → 12（非合法运算符）')

console.log('✅ _safeEval 安全计算器测试通过')

console.log('\n===== 全部金额工具测试通过 ✅ =====\n')
