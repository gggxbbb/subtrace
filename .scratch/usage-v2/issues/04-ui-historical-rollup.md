# 04 — UI 渲染器收敛 + 历史逐周期回看

Type: task
Status: needs-triage
Blocked by: 03

## What to build

UI 从「四分支」收敛为「两套渲染器」（ledger / stream），并给全部形态加历史逐周期回看（修复 H2、spec story 8/9）。

## Part A — 渲染器收敛

- 盈亏面板 `UsageVerdictPanel.tsx`：从 COUNT/QUOTA/SAVINGS/PACK 四分支收敛为**两套**——ledger（额度：余额/使用率/浪费/到期预警/超额标记，RESET+STACKED 共用骨架，STACKED 附包明细）与 stream（COUNT/SAVINGS：用量/价值/已省/回本差额，SAVINGS 走金额标签）。
- 录入卡 `UsageEntryPanel`：ledger 统一快照录入（remaining / used / percent 三姿势，semantic 随形状）；stream 保留增量录入。
- 记录页 `UsageRecordsManager`：按 `semantic` 标「已用/剩余」（不再按 grantMode 猜）；STACKED 隐藏增量录入的既有规则保留。
- `getUsageVerdict` 四变体合并后 verdict 判别字段收敛（`kind` 保留，装配层统一）。

## Part B — 历史逐周期回看（spec story 8）

- 详情页盈亏面板加**周期导航**（上一周期 / 下一周期 / 当前）：从 `usagePeriods`（ticket 01）取序列，对选中周期装配 ledger/stream verdict，展示该周期盈亏（额度浪费 / 计数价值 / 省钱差额）+ 成本。
- ledger 额外展示该周期已确认浪费事件（STACKED 现有 `wasteEvents` 复用；RESET 闭式解的浪费按周期归因）。
- 历史周期不因后续录入变化而重算的语义：沿用 ADR-0003 全局重算（记录驱动，历史随记录改）。

## Part C — 未录入态

- 新区间首条记录前，ledger/stream 面板显示「本周期未录入」态（取代空白），区分「还没记」与「用了 0%」（spec story 9）。
- 形态切换失真警告降级为普通提示（ticket 02 已改服务层，UI 文案同步）。

**Non-goals**：不做推送提醒；STACKED E1–E5 边界修复不并入。

## Acceptance

- [ ] 盈亏/录入/记录页渲染器收敛为 ledger/stream 两套，四分支消灭
- [ ] 历史逐周期回看：额度/计数/省钱三种形态都能回看任意历史周期盈亏 + 成本
- [ ] ledger 历史周期显示浪费归因（RESET 闭式解、STACKED 包事件）
- [ ] 新区间无记录显示「未录入」态
- [ ] 记录页按 `semantic` 标「已用/剩余」
- [ ] 失真警告降级为普通提示
- [ ] 全套件绿 + tsc 净

## 实现位置

- `src/app/(app)/subscriptions/[id]/UsageVerdictPanel.tsx` / `UsageEntryPanel.tsx`（两套渲染器）
- `src/app/(app)/subscriptions/[id]/UsageRecordsManager.tsx`（semantic 标签）
- 详情页 `page.tsx`（周期导航取 `usagePeriods`、历史 verdict 装配）
- `src/lib/usage/verdict.ts`（周期装配辅助，若 ticket 02 未落）

## 关键决策

- 历史回看复用 `usagePeriods` 序列 + 周期窗口装配，一次性覆盖全部形态（原只有 STACKED 有 wasteEvents）。
- 渲染器收敛以引擎为单位（ledger/stream），`usageKind` 只做展示标签与字段显隐，不再产生代码分支。

## 验证

浏览器冒烟：年付+月重置订阅设独立周期 → 录入快照 → 每月浪费正确 → 周期导航回看上月/季度 → 切形态无失真 → 共享订阅受益人只见成本份额 → 新区间未录入态显示。全套件绿 + tsc。
