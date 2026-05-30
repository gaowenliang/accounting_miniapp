# 账本系统设计方案

## 📚 概念

账本 = 独立的记账空间，有自己的：
- 账单列表
- 成员列表
- 统计数据
- 预算设置

---

## 🏗️ 数据结构

### 个人账本（本地 storage）
```js
{
  id: 'personal_default',
  name: '我的账本',
  icon: '📒',
  type: 'personal',
  createdAt: 1740000000000,
  // 数据存在本地 storage
  // bills → storage('bills')
  // members → storage('members')
}
```

### 共享账本（云端）
```js
{
  _id: 'cloud_xxx',
  _openid: 'owner_openid',
  name: '旅行基金',
  icon: '✈️',
  type: 'shared',
  inviteCode: 'AB3K9M',        // 6位邀请码
  createdBy: 'owner_openid',
  createdAt: 1740000000000,
  settings: {
    allowMemberInvite: true,    // 成员能否邀请
    defaultSplitMode: 'equal',  // 默认分摊方式
  },
  stats: {
    memberCount: 3,
    billCount: 48,
    totalExpense: 128000,       // 分
    updatedAt: 1740000000000
  }
}
```

### 共享账单（云数据库 `ledger_bills`）
```js
{
  _id: 'bill_xxx',
  ledgerId: 'cloud_xxx',
  _openid: 'creator_openid',
  amount: 35600,               // 原始金额（分）
  amountCNY: 35600,            // 人民币等值
  currency: 'CNY',
  exchangeRate: 1,
  type: 'expense',
  category: 'food',
  note: '火锅聚餐',
  payer: 'member_id_1',        // 付款人
  splits: null,                // 分摊明细
  account: 'wechat',
  date: 1740000000000,
  tags: [],
  createdAt: 1740000000000,
  createdBy: 'member_id_1'
}
```

### 成员关系（云数据库 `ledger_members`）
```js
{
  _id: 'member_xxx',
  ledgerId: 'cloud_xxx',
  _openid: 'user_openid',
  memberId: 'member_id_1',     // 业务ID
  name: '小明',
  avatar: '😊',
  role: 'owner',               // owner | admin | member
  joinedAt: 1740000000000
}
```

---

## 🔄 核心流程

### 1. 创建账本
```
用户点「+ 新建」→ 选类型 → 输入名称
  ├─ 个人账本 → 直接创建，存本地
  └─ 共享账本 → 云函数创建
       ├─ 写 ledgers 集合
       ├─ 写 ledger_members（自己为 owner）
       ├─ 生成6位邀请码
       └─ 切换到新账本
```

### 2. 加入账本
```
用户输入邀请码 → 云函数查询
  ├─ 找到 → 写 ledger_members
  ├─ 未找到 → 提示"邀请码无效"
  └─ 已加入 → 提示"已在账本中"
```

### 3. 切换账本
```
管理页账本列表 → 点击某个账本
  ├─ 个人账本 → setCurrentLedger({ inLedger: false })
  │    所有数据走本地 storage
  └─ 共享账本 → setCurrentLedger({ inLedger: true, id: 'xxx' })
       所有数据走云端缓存
       首次切换时拉取云端数据 → 缓存到本地
```

### 4. 乐观写（共享账本记账）
```
用户记账 →
  1. 先写入本地缓存（立即显示）
  2. 后台调用云函数写入
  3. 成功 → 更新缓存ID
  4. 失败 → 回滚本地缓存 + 提示重试
```

### 5. 数据同步
```
onShow / 下拉刷新 →
  云函数拉取账单（skip/limit分页）
  对比本地缓存：
    ├─ 云端有新的 → 追加到本地
    ├─ 本地有未同步的 → 重试推送
    └─ 冲突 → 以云端为准（最后写入胜出）
```

---

## 📱 UI 页面

### 管理页 — 账本区块
```
📚 账本                        [加入] [+ 新建]
┌─────────────────────────────────────┐
│ 📒 我的账本          个人      ✓   │  ← 当前
│ ✈️ 旅行基金         共享·3人  ›   │
│ 👨‍👩‍👧 家庭账本        共享·5人  ›   │
└─────────────────────────────────────┘
```

### 账本详情页（长按进入）
```
✈️ 旅行基金
共享账本 · 3人 · 创建于 2026/05/01

┌─────────────────────────────────┐
│ ✏️ 重命名                        │
│ 👥 成员管理              3人 ›  │
│ 🔗 邀请成员         AB3K9M ›   │
│ 📊 账本统计                      │
│ ⚙️ 账本设置                      │
│ 🗑️ 退出账本                      │
└─────────────────────────────────┘
```

### 成员管理页
```
👥 旅行基金 · 成员

┌─────────────────────────────────┐
│ 😊 小明         owner    ✓     │
│ 👩 小红         admin    ›     │
│ 👨 大伟         member   ›     │
│                        [+ 邀请] │
└─────────────────────────────────┘

成员权限：
- owner: 所有操作 + 删除账本 + 转让
- admin: 记账 + 管理成员 + 修改设置
- member: 记账 + 查看统计
```

---

## ☁️ 云函数接口

### billData 云函数（已有，需扩展）
```
action: 'create'  — 创建账单（自动带 ledgerId）
action: 'list'    — 拉取账单（按 ledgerId 筛选）
action: 'delete'  — 删除账单（验证 _openid）
action: 'stats'   — 统计（按 ledgerId 筛选）
```

### ledgerManage 云函数（新增）
```
action: 'create'     — 创建共享账本
action: 'join'       — 通过邀请码加入
action: 'info'       — 获取账本信息
action: 'update'     — 更新账本设置
action: 'members'    — 获取成员列表
action: 'removeMember' — 移除成员
action: 'leave'      — 退出账本
action: 'dissolve'   — 解散账本（owner only）
action: 'generateInvite' — 重新生成邀请码
```

---

## 🔒 权限矩阵

| 操作 | owner | admin | member | 非成员 |
|------|-------|-------|--------|--------|
| 记账 | ✅ | ✅ | ✅ | ❌ |
| 查看统计 | ✅ | ✅ | ✅ | ❌ |
| 邀请成员 | ✅ | ✅ | ❌ | ❌ |
| 移除成员 | ✅ | ✅ | ❌ | ❌ |
| 修改设置 | ✅ | ✅ | ❌ | ❌ |
| 重命名 | ✅ | ❌ | ❌ | ❌ |
| 转让owner | ✅ | ❌ | ❌ | ❌ |
| 解散账本 | ✅ | ❌ | ❌ | ❌ |
| 退出账本 | ✅ | ✅ | ✅ | — |

---

## 📦 数据库权限规则

```
ledgers:       doc._openid == auth.openid  (只有owner可写)
ledger_bills:  doc._openid == auth.openid  (只有创建者可写/删)
ledger_members: doc._openid == auth.openid (只有自己可退出)
accounts:      doc._openid == auth.openid
```

---

## ⏱️ 开发优先级

### P0 — MVP
1. ✅ 个人账本（已有）
2. ✅ 创建共享账本
3. ✅ 邀请码加入
4. ✅ 切换账本
5. ✅ 共享账本记账（乐观写）

### P1 — 完善
6. 成员管理（角色权限）
7. 账本详情页（设置/统计）
8. 数据同步（下拉刷新/冲突处理）
9. 账本动态流（谁记了什么）

### P2 — 高级
10. 账本间转账
11. 账本模板（旅行/家庭/情侣）
12. 账本导出
13. 离线模式优化
