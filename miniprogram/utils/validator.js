// utils/validator.js — 输入校验工具

/**
 * 校验金额（元，字符串输入）
 * - 必须 > 0
 * - 最多两位小数
 * - 最大 999,999.99
 */
function validateAmount(str) {
  if (!str || str.trim() === '') {
    return { valid: false, msg: '请输入金额' }
  }
  const num = parseFloat(str)
  if (isNaN(num)) {
    return { valid: false, msg: '请输入有效数字' }
  }
  if (num <= 0) {
    return { valid: false, msg: '金额必须大于0' }
  }
  if (num > 999999.99) {
    return { valid: false, msg: '单笔金额不能超过99万' }
  }
  // 检查小数位
  const parts = str.split('.')
  if (parts.length > 1 && parts[1].length > 2) {
    return { valid: false, msg: '最多两位小数' }
  }
  return { valid: true, value: num }
}

/**
 * 校验备注
 * - 最多 200 字
 */
function validateNote(note) {
  if (!note || note.trim() === '') {
    return { valid: true, value: '' }  // 备注可选
  }
  if (note.trim().length > 200) {
    return { valid: false, msg: '备注最多200字' }
  }
  // 过滤 HTML 标签
  if (/<[^>]+>/.test(note)) {
    return { valid: false, msg: '不能包含特殊字符' }
  }
  return { valid: true, value: note.trim() }
}

/**
 * 校验分类
 */
function validateCategory(category) {
  if (!category) {
    return { valid: false, msg: '请选择分类' }
  }
  return { valid: true, value: category }
}

/**
 * 校验账户名
 * - 1-10 个字符
 */
function validateAccountName(name) {
  if (!name || !name.trim()) {
    return { valid: false, msg: '请输入账户名称' }
  }
  if (name.trim().length > 10) {
    return { valid: false, msg: '账户名最多10个字' }
  }
  return { valid: true, value: name.trim() }
}

/**
 * 校验预算金额
 * - 必须 > 0
 * - 最大 9,999,999
 */
function validateBudget(str) {
  if (!str || str.trim() === '') {
    return { valid: false, msg: '请输入预算金额' }
  }
  const num = parseFloat(str)
  if (isNaN(num) || num <= 0) {
    return { valid: false, msg: '预算必须大于0' }
  }
  if (num > 9999999) {
    return { valid: false, msg: '预算金额过大' }
  }
  return { valid: true, value: num }
}

module.exports = {
  validateAmount,
  validateNote,
  validateCategory,
  validateAccountName,
  validateBudget
}
