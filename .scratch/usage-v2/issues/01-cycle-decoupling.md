# 01 — 周期解耦：usageCycle + 按周期分摊成本

Type: task
Status: ready-for-agent
Blocked by: None

## What to build

把用量窗口从「覆盖今天的计费成本段」解耦为独立的 `usageCycle`，并让 RESET/COUNT/SAVINGS 的 verdict 按周期窗口 + 按天分摊的周期成本计算（修复 A1/A2/H4；ADR-0013 D2）。

- **Schema**：`Subscription` 新增 `usageCycleUnit String?`（DAY|WEEK|MONTH|YEAR）、`usageCycleCount Int?`、`usageCycleAnchor DateTime?`（可空）。QUOTA 缺省回退计费周期（`cycleKind/cycleUnit/cycleCount/anchorDate`）；COUNT/SAVINGS 缺省回退成本段（现行为）。迁移：零迁移（全可空）。
- **新模块 `src/lib/usage/period.ts`（纯函数）**：
  - `usageCycleOf(sub)` → `{ unit, count, anchor } | null`（QUOTA 缺省合成计费周期）。
  - `usagePeriods(sub, today)` → 生成器，产出锚定 `anchor` 的周期窗口 `[start, end)` 序列（历史 + 当前；日历月/年锚定原始日，复用 `cost-engine.advanceCycle`，1/31→2/28→3/31 语义一致）。无 cycle 时回退成本段序列。
  - `periodCost(segments, [start, end))` → `{ net, amountUnknown }`：与 `[start,end)` 相交的成本段按 `segmentDailyRate` × 交集天数分摊；无相交为 0；相交段有未知金额 → `amountUnknown`。
- **verdict 装配**（`getUsageVerdict`）：RESET/COUNT/SAVINGS 三支的窗口从 `covering`（覆盖 today 的段）改为当前 `usageCycle` 周期；`cost` 从 `covering.net` 改为 `periodCost`。RESET 的 `wastedAmount = periodCost × (1 − used/total)`；COUNT/SAVINGS 的 `cost` 用分摊值。STACKED 本票不动（保留段归因；其 `unitCostOf` 已按段计价）。
- **配置**：`setUsageConfig`/`setUsageConfigAction` 接受 `usageCycle` 三字段；向导（QUOTA 步）暴露「用量重置周期」（默认跟随计费周期，可覆盖为独立月/季/年）。

**Non-goals**：不改 `semantic`（ticket 02）；不改记录守卫（ticket 03）；不动 STACKED 段归因；不做历史回看 UI（ticket 04）。

## Acceptance

- [ ] schema 三字段落库，全可空，存量订阅零迁移、行为不变（QUOTA 缺省 = 计费周期，月付用户数字不变）
- [ ] `usagePeriods`：月/年锚定原始日序列正确（含 1/31→2/28→3/31 折返）
- [ ] `periodCost`：完全覆盖/部分覆盖/无覆盖/未知金额段四种情形正确分摊
- [ ] RESET verdict 用周期窗口 + 分摊成本：年付 + 月重置（usageCycle=MONTH）下每月 `wastedAmount = 年成本/12 × (1 − 当月使用率)`，前 11 个月快照不再被丢弃
- [ ] COUNT/SAVINGS verdict 成本改分摊值，数字回归不破坏
- [ ] STACKED verdict 本票零改动（回归）
- [ ] 向导可设独立用量周期（覆盖计费周期）
- [ ] 纯函数/服务缝测试全绿 + tsc 净

## 实现位置

- `src/lib/usage/period.ts`（新）+ `period.test.ts`
- `src/lib/usage/service.ts`（`getUsageVerdict` 三支改周期窗口/分摊成本）
- `src/lib/usage/actions.ts` + 向导 `UsageWizard.tsx`（QUOTA 步加用量周期字段）
- `prisma/schema.prisma` + 迁移

## 关键决策

- 周期推进复用 `advanceCycle`，与成本段同一份逻辑，日历月/年锚定原始日。
- QUOTA 缺省 = 计费周期（不是成本段）：典型月付用户零感知，同时给年付用户一个可设的月周期逃生口——这是修复 A1 的最小语义。
- `periodCost` 以 `segmentDailyRate` 分摊而非按 segmentDays 均摊，避免跨段费率不均。

## 验证

`src/lib/usage/period.test.ts` + `service.test.ts` 新增用例（年付+月重置场景、periodCost 四情形）+ 全套件绿 + `tsc --noEmit`。浏览器冒烟：年付订阅设月用量周期 → 录两条月快照 → 每月浪费正确。
