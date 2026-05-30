# 数据库权限配置

> 微信云开发 → 云数据库 → 每个集合 → 权限设置

## 权限规则

所有集合使用「自定义安全规则」，**只允许创建者读写自己的数据**：

```json
{
  "read": "doc._openid == auth.openid",
  "write": "doc._openid == auth.openid"
}
```

## 各集合权限

| 集合 | 权限 | 说明 |
|------|------|------|
| `bills` | creator | 个人账单，只有创建者可读写 |
| `ledger_bills` | 自定义 | 共享账本账单，成员可读写（需在云函数中校验成员身份） |
| `ledgers` | creator | 账本创建者管理 |
| `ledger_members` | 自定义 | 加入/退出通过云函数操作 |
| `accounts` | creator | 个人账户 |

## ledger_bills 特殊权限

```json
{
  "read": "auth.openid in get('database.ledger_members').where({ledgerId: doc.ledgerId}).data._openid",
  "write": "doc._openid == auth.openid"
}
```

> 实际操作中，ledger_bills 的读写都通过云函数完成，云函数内校验成员身份，所以集合权限可以设为「仅管理端可读写」（云函数有管理员权限）。

## 操作步骤

1. 打开微信开发者工具
2. 云开发控制台 → 数据库
3. 选择集合 → 权限设置
4. 切换到「自定义安全规则」
5. 粘贴对应规则 → 保存

## initCollections 自动执行

调用 `initCollections` 云函数会自动创建以下集合：
- bills
- ledger_bills
- ledgers
- ledger_members
- accounts

创建后需要手动设置权限（云函数无法设置权限规则）。
