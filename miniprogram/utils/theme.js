// 设计系统 — 基于 UI 参考稿
// 主色调：靛蓝（Indigo）系

module.exports = {
  // 主色
  primary: '#4F46E5',        // 靛蓝
  primaryLight: '#6366F1',   // 浅靛蓝
  primaryBg: '#EEF2FF',      // 极浅靛蓝背景
  primaryDark: '#3730A3',    // 深靛蓝

  // 渐变
  gradientPrimary: 'linear-gradient(135deg, #4F46E5, #7C3AED)',  // 靛蓝→紫
  gradientCard: 'linear-gradient(135deg, #4F46E5, #6366F1)',
  gradientExpense: 'linear-gradient(135deg, #EF4444, #F87171)',
  gradientIncome: 'linear-gradient(135deg, #10B981, #34D399)',

  // 语义色
  expense: '#EF4444',        // 支出红
  expenseLight: '#FEF2F2',
  income: '#10B981',         // 收入绿
  incomeLight: '#ECFDF5',

  // 中性色
  bg: '#F7F7FA',             // 页面背景
  card: '#FFFFFF',           // 卡片
  title: '#1F2937',          // 标题
  text: '#374151',           // 正文
  secondary: '#6B7280',      // 次要文字
  hint: '#9CA3AF',           // 提示文字
  border: '#F3F4F6',         // 分割线
  divider: '#E5E7EB',

  // 圆角
  radiusSm: '8rpx',
  radiusMd: '16rpx',
  radiusLg: '24rpx',
  radiusXl: '32rpx',
  radiusFull: '999rpx',

  // 阴影
  shadow: '0 2rpx 12rpx rgba(79,70,229,0.06)',
  shadowLg: '0 8rpx 32rpx rgba(79,70,229,0.12)',
}
