// data/categories.js — 收支分类数据

const EXPENSE_CATEGORIES = [
  { key: 'food',           name: '美食', icon: '🍜', color: '#FF9800' },
  { key: 'drinks',         name: '饮品', icon: '☕', color: '#D2691E' },
  { key: 'shopping',       name: '购物', icon: '🛒', color: '#E91E63' },
  { key: 'transport',      name: '交通', icon: '✈️', color: '#2196F3' },
  { key: 'tickets',        name: '门票', icon: '🎫', color: '#9C27B0' },
  { key: 'accommodation',  name: '住宿', icon: '🏨', color: '#795548' },
  { key: 'entertainment',  name: '娱乐', icon: '🎮', color: '#FF5722' },
  { key: 'telecom',        name: '通讯', icon: '📱', color: '#00BCD4' },
  { key: 'medical',        name: '医疗', icon: '💊', color: '#F44336' },
  { key: 'education',      name: '教育', icon: '🎓', color: '#3F51B5' },
  { key: 'clothing',       name: '服饰', icon: '👕', color: '#FF4081' },
  { key: 'social',         name: '人情', icon: '🎁', color: '#FF9800' },
  { key: 'pet',            name: '宠物', icon: '🐾', color: '#8BC34A' },
  { key: 'luggage',        name: '行李', icon: '🧳', color: '#6366F1' },
  { key: 'other',          name: '其他', icon: '📦', color: '#607D8B' }
]

const INCOME_CATEGORIES = [
  { key: 'salary',      name: '工资', icon: '💰', color: '#4CAF50' },
  { key: 'bonus',       name: '奖金', icon: '💸', color: '#8BC34A' },
  { key: 'investment',  name: '投资', icon: '📈', color: '#00BCD4' },
  { key: 'gift',        name: '红包', icon: '🎁', color: '#FF9800' },
  { key: 'freelance',   name: '兼职', icon: '💼', color: '#2196F3' },
  { key: 'other',       name: '其他', icon: '📦', color: '#607D8B' }
]

// 默认账户
const DEFAULT_ACCOUNTS = [
  { key: 'wechat',   name: '微信支付', icon: '💚', type: 'digital' },
  { key: 'alipay',   name: '支付宝',   icon: '💙', type: 'digital' },
  { key: 'cash',     name: '现金',     icon: '💵', type: 'cash' },
  { key: 'bank',     name: '银行卡',   icon: '🏦', type: 'bank' }
]

function getCategoryBy(key, type) {
  const list = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES
  return list.find(c => c.key === key) || list[list.length - 1]
}

function getCategories(type) {
  // 先尝试读取缓存（支持自定义分类）
  try {
    const cached = wx.getStorageSync('categories_' + type)
    if (cached && cached.length > 0) return cached
  } catch (e) {}
  return type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES
}

function saveCategories(type, list) {
  try { wx.setStorageSync('categories_' + type, list) } catch (e) {}
}

function resetCategories() {
  try {
    wx.removeStorageSync('categories_expense')
    wx.removeStorageSync('categories_income')
  } catch (e) {}
}

module.exports = {
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  DEFAULT_ACCOUNTS,
  getCategoryBy,
  getCategories,
  saveCategories,
  resetCategories
}
