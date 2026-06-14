/**
 * 单元测试 — AA 结算算法 (storage._calcAA)
 * 运行: node tests/unit/test-aa.js
 *
 * 测试策略：直接测试 _calcAA 的纯函数逻辑，
 * 不依赖 wx.cloud / wx.getStorageSync 等平台 API
 */

const assert = require('assert')

// 提取 _calcAA 的纯逻辑版本进行测试
// 由于 storage.js 依赖 wx 全局和 require 链，这里复制核心算法做独立测试
// 如果算法改了，同步更新这里

/**
 * AA 结算核心算法（从 storage.js _calcAA 提取）
 */
function _calcAA(bills, members, participantIds) {
  const memberMap = {}
  members.forEach(m => { memberMap[m.id] = m })

  const participants = participantIds || members.map(m => m.id)
  const participantSet = new Set(participants)
  const personCount = participants.length
  if (personCount === 0) return { totalExpense: 0, perPerson: 0, details: [], personCount: 0, paid: {}, balance: {} }

  const expenseBills = bills.filter(b => b.type === 'expense')
  const paid = {}
  const shouldPay = {}
  participants.forEach(id => { paid[id] = 0; shouldPay[id] = 0 })
  let totalExpense = 0

  expenseBills.forEach(b => {
    const billAmount = b.amountCNY || b.amount
    const payerId = b.payer || 'self'

    if (!participantSet.has(payerId)) {
      totalExpense += billAmount
      paid[payerId] = (paid[payerId] || 0) + billAmount
      return
    }

    totalExpense += billAmount
    paid[payerId] = (paid[payerId] || 0) + billAmount

    if (b.splits && b.splits.length > 0) {
      if (b.currency && b.currency !== 'CNY' && b.exchangeRate && b.amount > 0) {
        let splitSum = 0
        const splitsInCNY = b.splits.filter(s => participantSet.has(s.memberId)).map((s, i, arr) => {
          if (i < arr.length - 1) {
            const ratio = b.amount > 0 ? s.amount / b.amount : 0
            const v = Math.round(ratio * billAmount)
            splitSum += v
            return { memberId: s.memberId, amount: v }
          } else {
            return { memberId: s.memberId, amount: billAmount - splitSum }
          }
        })
        splitsInCNY.forEach(s => {
          if (participantSet.has(s.memberId)) {
            shouldPay[s.memberId] = (shouldPay[s.memberId] || 0) + s.amount
          }
        })
      } else {
        b.splits.forEach(s => {
          if (participantSet.has(s.memberId)) {
            shouldPay[s.memberId] = (shouldPay[s.memberId] || 0) + s.amount
          }
        })
      }
    } else {
      const perPersonShare = Math.floor(billAmount / personCount)
      const remainder = billAmount - perPersonShare * personCount
      participants.forEach((id, idx) => {
        shouldPay[id] = (shouldPay[id] || 0) + perPersonShare + (idx < remainder ? 1 : 0)
      })
    }
  })

  const balance = {}
  participants.forEach(id => {
    balance[id] = (paid[id] || 0) - (shouldPay[id] || 0)
  })

  const perPerson = Math.floor(totalExpense / personCount)

  const details = []
  const debtors = []
  const creditors = []
  participants.forEach(id => {
    if (balance[id] > 0) creditors.push({ id, amount: balance[id] })
    else if (balance[id] < 0) debtors.push({ id, amount: -balance[id] })
  })

  debtors.sort((a, b) => b.amount - a.amount)
  creditors.sort((a, b) => b.amount - a.amount)

  let di = 0, ci = 0
  while (di < debtors.length && ci < creditors.length) {
    const d = debtors[di], c = creditors[ci]
    const settle = Math.min(d.amount, c.amount)
    if (settle > 0) {
      details.push({
        from: d.id,
        fromName: (memberMap[d.id] || {}).name || '未知',
        to: c.id,
        toName: (memberMap[c.id] || {}).name || '未知',
        amount: settle
      })
    }
    d.amount -= settle
    c.amount -= settle
    if (d.amount <= 0) di++
    if (c.amount <= 0) ci++
  }

  return { totalExpense, perPerson, personCount, paid, shouldPay, balance, details }
}

// ========== 测试用例 ==========

const MEMBERS = [
  { id: 'A', name: 'Alice', avatar: '👩' },
  { id: 'B', name: 'Bob', avatar: '👨' },
  { id: 'C', name: 'Carol', avatar: '👩‍🦰' },
]

console.log('===== AA 结算算法测试 =====\n')

// ---------- 测试 1: 最简单的两人 AA ----------
// A 付了 100 元，B 付了 0 元，两人均摊
// 结果：B 应给 A 50 元
{
  const bills = [
    { type: 'expense', amount: 10000, amountCNY: 10000, payer: 'A' },
  ]
  const result = _calcAA(bills, MEMBERS, ['A', 'B'])

  assert.strictEqual(result.totalExpense, 10000, '总支出 100 元')
  assert.strictEqual(result.personCount, 2, '2 人参与')
  assert.strictEqual(result.paid.A, 10000, 'A 垫付 100 元')
  assert.strictEqual(result.paid.B, 0, 'B 垫付 0 元')
  assert.strictEqual(result.shouldPay.A, 5000, 'A 应承担 50 元')
  assert.strictEqual(result.shouldPay.B, 5000, 'B 应承担 50 元')
  assert.strictEqual(result.balance.A, 5000, 'A 净差额 +50 元（应收）')
  assert.strictEqual(result.balance.B, -5000, 'B 净差额 -50 元（应付）')
  assert.strictEqual(result.details.length, 1, '1 条结算明细')
  assert.strictEqual(result.details[0].from, 'B', 'B → A')
  assert.strictEqual(result.details[0].to, 'A', 'B → A')
  assert.strictEqual(result.details[0].amount, 5000, 'B 给 A 50 元')

  console.log('✅ 测试 1 通过: 两人简单 AA')
}

// ---------- 测试 2: 多笔账单均摊 ----------
// A 付 60 元，B 付 40 元，均摊后各自应出 50 元
// 结果：B 应给 A 10 元
{
  const bills = [
    { type: 'expense', amount: 6000, amountCNY: 6000, payer: 'A' },
    { type: 'expense', amount: 4000, amountCNY: 4000, payer: 'B' },
  ]
  const result = _calcAA(bills, MEMBERS, ['A', 'B'])

  assert.strictEqual(result.totalExpense, 10000, '总支出 100 元')
  assert.strictEqual(result.paid.A, 6000, 'A 垫付 60')
  assert.strictEqual(result.paid.B, 4000, 'B 垫付 40')
  assert.strictEqual(result.balance.A, 1000, 'A 净差额 +10')
  assert.strictEqual(result.balance.B, -1000, 'B 净差额 -10')
  assert.strictEqual(result.details[0].amount, 1000, 'B 给 A 10 元')

  console.log('✅ 测试 2 通过: 多笔账单均摊')
}

// ---------- 测试 3: 三人均摊 ----------
// A 付 300，B 付 0，C 付 0
// 每人应出 100，B 和 C 各给 A 100
{
  const bills = [
    { type: 'expense', amount: 30000, amountCNY: 30000, payer: 'A' },
  ]
  const result = _calcAA(bills, MEMBERS, ['A', 'B', 'C'])

  assert.strictEqual(result.personCount, 3)
  assert.strictEqual(result.perPerson, 10000, '人均 100')
  assert.strictEqual(result.shouldPay.A, 10000, 'A 应出 100')
  assert.strictEqual(result.shouldPay.B, 10000, 'B 应出 100')
  assert.strictEqual(result.shouldPay.C, 10000, 'C 应出 100')
  assert.strictEqual(result.balance.A, 20000, 'A +200')
  assert.strictEqual(result.balance.B, -10000, 'B -100')
  assert.strictEqual(result.balance.C, -10000, 'C -100')
  // 两条结算明细：B→A 100, C→A 100
  assert.strictEqual(result.details.length, 2)

  console.log('✅ 测试 3 通过: 三人均摊')
}

// ---------- 测试 4: 金额不能整除的取整（余分）----------
// 3 人，一笔 100 元（10000 分）支出，10000/3=3333.33
// floor = 3333, remainder = 1 → 第一个人多出 1 分
{
  const bills = [
    { type: 'expense', amount: 10000, amountCNY: 10000, payer: 'A' },
  ]
  const result = _calcAA(bills, MEMBERS, ['A', 'B', 'C'])

  // 3333 + 3333 + 3334 = 10000 ✓
  assert.strictEqual(result.shouldPay.A, 3334, 'A 多承担 1 分（余分给第一个）')
  assert.strictEqual(result.shouldPay.B, 3333, 'B 承担 33.33')
  assert.strictEqual(result.shouldPay.C, 3333, 'C 承担 33.33')
  // 总和必须守恒
  const totalShould = result.shouldPay.A + result.shouldPay.B + result.shouldPay.C
  assert.strictEqual(totalShould, 10000, '应承担总额 = 总支出（守恒）')

  console.log('✅ 测试 4 通过: 余分取整 + 总额守恒')
}

// ---------- 测试 5: 自定义分摊 (splits) ----------
// A 付 300 元，指定 A 承担 100, B 承担 100, C 承担 100
{
  const bills = [
    {
      type: 'expense', amount: 30000, amountCNY: 30000, payer: 'A',
      splits: [
        { memberId: 'A', amount: 10000 },
        { memberId: 'B', amount: 10000 },
        { memberId: 'C', amount: 10000 },
      ]
    },
  ]
  const result = _calcAA(bills, MEMBERS, ['A', 'B', 'C'])

  assert.strictEqual(result.shouldPay.A, 10000, 'A 承担 100')
  assert.strictEqual(result.shouldPay.B, 10000, 'B 承担 100')
  assert.strictEqual(result.shouldPay.C, 10000, 'C 承担 100')
  assert.strictEqual(result.balance.A, 20000, 'A +200')
  assert.strictEqual(result.balance.B, -10000, 'B -100')
  assert.strictEqual(result.balance.C, -10000, 'C -100')

  console.log('✅ 测试 5 通过: 自定义分摊 splits')
}

// ---------- 测试 6: 不等比 splits ----------
// A 付 300 元，指定 A 承担 50, B 承担 100, C 承担 150
{
  const bills = [
    {
      type: 'expense', amount: 30000, amountCNY: 30000, payer: 'A',
      splits: [
        { memberId: 'A', amount: 5000 },
        { memberId: 'B', amount: 10000 },
        { memberId: 'C', amount: 15000 },
      ]
    },
  ]
  const result = _calcAA(bills, MEMBERS, ['A', 'B', 'C'])

  assert.strictEqual(result.shouldPay.A, 5000, 'A 承担 50')
  assert.strictEqual(result.shouldPay.B, 10000, 'B 承担 100')
  assert.strictEqual(result.shouldPay.C, 15000, 'C 承担 150')
  assert.strictEqual(result.balance.A, 25000, 'A +250 (300-50)')
  assert.strictEqual(result.balance.B, -10000, 'B -100')
  assert.strictEqual(result.balance.C, -15000, 'C -150')

  console.log('✅ 测试 6 通过: 不等比 splits')
}

// ---------- 测试 7: 非参与人付款 ----------
// A（非参与者）付了 100 元，B 和 C 是参与者
// A 的 100 计入 totalExpense 和 A 的应收，B/C 不承担
{
  const bills = [
    { type: 'expense', amount: 10000, amountCNY: 10000, payer: 'A' },
  ]
  const result = _calcAA(bills, MEMBERS, ['B', 'C'])

  assert.strictEqual(result.totalExpense, 10000, '总支出包含非参与人的 100')
  assert.strictEqual(result.paid.A, 10000, 'A 垫付 100')
  assert.strictEqual(result.paid.B, 0, 'B 没垫付')
  assert.strictEqual(result.paid.C, 0, 'C 没垫付')
  assert.strictEqual(result.shouldPay.B, 0, 'B 不应承担（A 不是参与者）')
  assert.strictEqual(result.shouldPay.C, 0, 'C 不应承担')

  console.log('✅ 测试 7 通过: 非参与人付款')
}

// ---------- 测试 8: 外币 splits 守恒 ----------
// USD 100 (amount=10000分), rate=7.19, amountCNY=71900
// splits 等分 3 份，每份 3333.33 分
// 换算成 CNY 后，最后一人吸收取整误差
{
  const bills = [
    {
      type: 'expense',
      amount: 10000,          // USD 100.00 (分)
      amountCNY: 71900,       // CNY 719.00 (分)
      currency: 'USD',
      exchangeRate: 7.19,
      payer: 'A',
      splits: [
        { memberId: 'A', amount: 3333 },   // 1/3
        { memberId: 'B', amount: 3333 },
        { memberId: 'C', amount: 3334 },   // 最后一人吸收余数
      ]
    },
  ]
  const result = _calcAA(bills, MEMBERS, ['A', 'B', 'C'])

  // splits 金额 = 外币分，需要按 ratio 换算成 CNY 分
  // A: 3333/10000 * 71900 = 23963.27 → 23963
  // B: 3333/10000 * 71900 = 23963.27 → 23963, splitSum = 47926
  // C: 71900 - 47926 = 23974 (最后一人取剩余)
  const totalShouldPay = result.shouldPay.A + result.shouldPay.B + result.shouldPay.C
  assert.strictEqual(totalShouldPay, 71900, '外币 splits 换算后总额守恒 = amountCNY')

  console.log('✅ 测试 8 通过: 外币 splits 守恒')
}

// ---------- 测试 9: income 不计入 AA ----------
// 一笔收入 + 一笔支出，AA 只算支出
{
  const bills = [
    { type: 'income', amount: 50000, amountCNY: 50000, payer: 'A' },
    { type: 'expense', amount: 6000, amountCNY: 6000, payer: 'B' },
  ]
  const result = _calcAA(bills, MEMBERS, ['A', 'B'])

  assert.strictEqual(result.totalExpense, 6000, '只算支出 60 元')
  assert.strictEqual(result.paid.A, 0, 'A 没垫付支出')
  assert.strictEqual(result.paid.B, 6000, 'B 垫付 60')

  console.log('✅ 测试 9 通过: 收入不计入 AA')
}

// ---------- 测试 10: 空数据 ----------
{
  const result = _calcAA([], MEMBERS, ['A', 'B'])
  assert.strictEqual(result.totalExpense, 0)
  assert.strictEqual(result.details.length, 0)

  console.log('✅ 测试 10 通过: 空数据')
}

// ---------- 测试 11: 完整的复杂场景 ----------
// 模拟一次三人旅行：
// - A 付住宿 600 元（AA 均摊）
// - B 付餐饮 150 元（AA 均摊）
// - C 付交通 90 元（AA 均摊）
// - A 付购物 300 元（只有 A 和 B 分摊，C 不参与）
// 总支出 1140 元
{
  const bills = [
    { type: 'expense', amount: 60000, amountCNY: 60000, payer: 'A' },  // 住宿
    { type: 'expense', amount: 15000, amountCNY: 15000, payer: 'B' },  // 餐饮
    { type: 'expense', amount: 9000, amountCNY: 9000, payer: 'C' },    // 交通
    { type: 'expense', amount: 30000, amountCNY: 30000, payer: 'A',
      splits: [{ memberId: 'A', amount: 15000 }, { memberId: 'B', amount: 15000 }]  // 购物只有 AB 分
    },
  ]
  const result = _calcAA(bills, MEMBERS, ['A', 'B', 'C'])

  // 总支出 = 600 + 150 + 90 + 300 = 1140 元
  assert.strictEqual(result.totalExpense, 114000, '总支出 1140 元')

  // 垫付：A=900, B=150, C=90
  assert.strictEqual(result.paid.A, 90000, 'A 垫付 900')
  assert.strictEqual(result.paid.B, 15000, 'B 垫付 150')
  assert.strictEqual(result.paid.C, 9000, 'C 垫付 90')

  // 应承担：
  // 住宿 600 / 3 = 200 each
  // 餐饮 150 / 3 = 50 each
  // 交通 90 / 3 = 30 each
  // 购物 splits: A=150, B=150, C=0
  // 合计：A=200+50+30+150=430, B=200+50+30+150=430, C=200+50+30+0=280
  assert.strictEqual(result.shouldPay.A, 43000, 'A 应承担 430')
  assert.strictEqual(result.shouldPay.B, 43000, 'B 应承担 430')
  assert.strictEqual(result.shouldPay.C, 28000, 'C 应承担 280')

  // 净差额：A=900-430=+470, B=150-430=-280, C=90-280=-190
  assert.strictEqual(result.balance.A, 47000, 'A +470')
  assert.strictEqual(result.balance.B, -28000, 'B -280')
  assert.strictEqual(result.balance.C, -19000, 'C -190')

  // 结算明细：B→A 280, C→A 190
  const totalSettle = result.details.reduce((s, d) => s + d.amount, 0)
  assert.strictEqual(totalSettle, 47000, '结算总额 = A 的应收')

  console.log('✅ 测试 11 通过: 三人旅行复杂场景')
}

// ---------- 测试 12: 验证守恒定律 ----------
// 任意场景：所有人 shouldPay 之和 = totalExpense
// 所有人 balance 之和 = 0
// 结算明细总额 = 债务总额
{
  const bills = [
    { type: 'expense', amount: 33456, amountCNY: 33456, payer: 'A' },
    { type: 'expense', amount: 12789, amountCNY: 12789, payer: 'B' },
    { type: 'expense', amount: 9900, amountCNY: 9900, payer: 'C' },
    { type: 'expense', amount: 500, amountCNY: 500, payer: 'A' },
  ]
  const result = _calcAA(bills, MEMBERS, ['A', 'B', 'C'])

  // 守恒 1: shouldPay 之和 = totalExpense
  const totalShould = result.shouldPay.A + result.shouldPay.B + result.shouldPay.C
  assert.strictEqual(totalShould, result.totalExpense, 'shouldPay 守恒')

  // 守恒 2: balance 之和 = 0
  const totalBalance = result.balance.A + result.balance.B + result.balance.C
  assert.strictEqual(totalBalance, 0, 'balance 守恒（应收=应付）')

  // 守恒 3: 结算明细 from 金额 = debtor 总额
  const totalFromSettle = result.details.reduce((s, d) => s + d.amount, 0)
  const totalDebt = Object.values(result.balance).filter(v => v < 0).reduce((s, v) => s + (-v), 0)
  assert.strictEqual(totalFromSettle, totalDebt, '结算总额 = 债务总额')

  console.log('✅ 测试 12 通过: 守恒定律验证')
}

console.log('\n===== 全部 AA 结算测试通过 ✅ =====\n')
