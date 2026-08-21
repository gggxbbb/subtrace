# 03 — 单一池规则 + 录入守卫补全

Type: task
Status: resolved
Blocked by: 02

## What to build

补上审计的 D 类（共享池双倍计数）与 B 类（守卫缺失）缺口；ADR-0013 D4 + spec B 类。

## Part A — 单一池规则（修复 D1）

额度（ledger，RESET + STACKED）是池级：池的观测（快照）**只由所有者录入**；受益用户不再被允许录 QUOTA 快照（录入走 `assertUsageAllowed` 的 USER 受益人路径，改为 QUOTA 只放行 owner）。受益人视图只按权重切成本份额，用量/浪费保持池级（STACKED 现有池级口径扩展到 RESET）。COUNT/SAVINGS（stream）维持按人记录、按人求和。

- `addQuotaSnapshot`：`assertUsageAllowed` 后追加「QUOTA 仅 owner」守卫；受益用户录快照报明确错误。
- `getUsageVerdict` 的 `forUserId`：ledger 下忽略 `forUserId` 的用量过滤（只切成本份额）——RESET 与 STACKED 统一。
- 受益人视图：QUOTA 只展示「我的成本份额 + 池级余额/浪费」，不再逐人算 usageRate（消除双倍计数展示）。

## Part B — 录入守卫补全（审计 B1–B6）

- 负数/负百分比：`addQuotaSnapshot` 拒绝 `used < 0`、`percent < 0`；`addUsage` 拒绝 `quantity < 0`（COUNT 退单场景若需负增量另议，本票不加机制）。
- 超额百分比：`percent > 100` 不再静默封顶——接受但明确标记超额（verdict 显示「超额 X%」），不报错（overage 计费是真实产品行为）。
- 未来日期：`date > today` 拒绝（`addQuotaSnapshot`/`addUsage`/`addSavings`/`addPack` 统一校验）。
- 混传：同一笔 `used` + `percent` 同时给 → 明确报错（对齐 STACKED 已有 `stacked_remaining_required` 风格）。
- `percent = 0` 可录：修 `actions.ts` 的 `percent && …`（`0` 被当空 → 报「需要已用量」）——空串/undefined 判空，`0` 保留。
- `addPack`：校验 `grantedAt ≤ expiresAt`、`grantedAt` 不晚于订阅到期、`expiresAt` 不早于 `grantedAt`——无效包不再静默不可见。
- `updateUsage`：按记录类型限定可改字段（COUNT/SAVINGS 不可改 `quotaTotal`；QUOTA 不可改 `unitPrice` 对 verdict 无意义字段），防脏数据。
- `addSavings`：负数增量明确拒绝（审计 F4）。

**Non-goals**：UI 渲染器收敛（ticket 04）；STACKED E1–E5 边界。

## Acceptance

- [ ] QUOTA 快照仅 owner 可录；受益用户被拒并报明确错误
- [ ] RESET 与 STACKED 在 `forUserId` 下都只切成本份额、不切用量（双倍计数消除）
- [ ] 负数/负百分比/未来日期/used+percent 混传/负数已省 全部明确拒绝
- [ ] 超额百分比接受并标记，不静默封顶
- [ ] `percent=0` 可录（空串才判空）
- [ ] `addPack` 校验起止顺序与订阅区间，无效包拒绝
- [ ] `updateUsage` 按记录类型限定字段
- [ ] 服务缝测试全绿 + tsc 净

## 实现位置

- `src/lib/usage/service.ts`（池规则守卫、录入守卫、`updateUsage` 字段限定）
- `src/lib/usage/actions.ts`（`percent` 判空修复、表单校验透传）
- `src/lib/usage/service.test.ts` 新增用例

## 关键决策

- 池规则是对 ADR-0012 Q10 裁决（STACKED 池级）的推广：RESET 共享订阅同样数学上双倍计数不成立，统一到一条规则而非两处特例。
- 超额百分比不拒绝：overage 是真实语义，拒绝会挡掉有效数据；标记即可。

## 验证

服务缝测试（池规则守卫、各守卫拒绝路径、percent=0/超额/未来日期）+ 全套件绿 + tsc。
