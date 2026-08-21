# 用量模型 v2：双引擎收口与周期解耦

Status: ready-for-agent

决策全文见 ADR-0013 与 CONTEXT.md「用量 / 额度包 / 发放形态」词条（术语同步随实现进行）。设计已与用户确认三项裁决：SAVINGS 保留薄壳共用事件引擎、记录语义随记录走（`semantic` 字段）、四阶段增量推进（每阶段独立验证、可回滚）。

## Problem Statement

现用量跟踪是补丁堆。审计（2026-08-21）定位四根正交轴被拧在一起：三口径（COUNT/QUOTA/SAVINGS）× 两发放形态（RESET/STACKED）× 两套脚本契约 × 记录语义挂在形态上 × 用量窗口硬绑计费成本段。后果是 A 类周期错配（年付 + 月重置：`wastedAmount = 全年成本 × (1 − 当月使用率)` 放大 ~12 倍，前 11 个月快照被丢弃）、D 类共享池双倍计数（RESET 无池级例外）、B 类守卫缺失（负数/未来日期/混传可造荒谬数字）、H2 历史回看只覆盖 STACKED。目标：两个引擎 + 两条单一规则，补丁归位。

## Solution

领域还原为两种形状（ADR-0013 D1）：**额度账本**（池 + 发放 + 消耗，RESET 与 STACKED 是同一台机器，区别仅在包有效期）与**事件流**（增量按周期求和，COUNT 与 SAVINGS 同一台机器）。代码分叉只发生在引擎层，`usageKind`/`grantMode` 是配置值。

四项收口（ADR-0013 D2–D5）：周期与成本段解耦（`usageCycle` 独立于计费周期，周期成本按天分摊）；记录语义自描述（`UsageRecord.semantic` 随记录走，形态切换不再失真）；单一池规则（额度池级、事件按人，取代两处特例）；脚本契约按引擎收口（ledger 收 `{remaining}` 原生 + `{used,total?}` 适配器，单解析器）。

## User Stories

1. 作为用户，我想把"每月 21 日重置额度、但按年付费"的订阅设为独立用量周期（月），以便盈亏按每月额度算，不再被整年成本扭曲。
2. 作为用户，我想手动模式的订阅也能设用量周期，以便额度不会"永不重置"。
3. 作为用户，我想切换发放形态（RESET ↔ STACKED）时历史记录不被重新解读，以便切换不再产生失真警告。
4. 作为用户，我想共享订阅的额度（流量池）只有所有者能记录快照，受益用户只看自己的成本份额，以便不再双倍计数。
5. 作为用户，我想录入负数、超过 100% 的百分比、或未来日期的记录被明确拒绝（或正确说明超额），以便不会产生荒谬的盈亏。
6. 作为用户，我想同一笔录入同时给 used 和 percent 被拒绝，以便录入口径单一。
7. 作为用户，我想用量脚本对额度订阅既可返回 `{ remaining }` 也可返回 `{ used, total? }`，两种都能正确落库，以便不同厂商 API 形态都能接入。
8. 作为用户，我想在详情页回看**任意历史周期**的盈亏（额度浪费 / 计数价值 / 省钱差额），以便复盘上个订阅月/季度用得好不好。
9. 作为用户，我想在新区间首条记录前看到"本周期未录入"而非空白面板，以便区分"还没记"与"用了 0%"。

## Implementation Decisions

- **Schema（ticket 01/02）**：`Subscription` 新增 `usageCycleUnit/Count/Anchor`（可空；QUOTA 缺省回退计费周期，典型月付用户零感知）；`UsageRecord` 新增 `semantic String?`（TOTAL: `USED`/`REMAINING`；DELTA 空）。存量迁移：RESET TOTAL → `USED`，STACKED TOTAL → `REMAINING`。`QuotaPack` 不变。
- **周期模块（ticket 01，新纯函数）**：`usage/period.ts` —— `usagePeriods(sub, today)` 按锚定周期产出窗口序列；`periodCost(segments, [start, end))` 按 `segmentDailyRate` 天交集分摊；历史回看 = `map(usagePeriods)`。周期推进复用 `cost-engine.advanceCycle`（日历月/年锚定原始日）。
- **引擎收口（ticket 02）**：`usage/ledger.ts` 泛化——STACKED 走 FEFO（`pack-ledger` 保留），RESET 走单包闭式解（`periodCost × (1 − used/total)`，共享周期/分摊/快照判定，不物化包行）；`usage/stream.ts` 事件聚合（COUNT/SAVINGS 共用，SAVINGS 增量即金额）。`getUsageVerdict` 按引擎装配，`verdictAmount` 语义：ledger 浪费导向（≤0）、stream 价值导向（值差/省钱差）。
- **记录语义（ticket 02）**：`addQuotaSnapshot` 按入参形状定语义（`remaining`→REMAINING；`used`/`percent`→USED），守卫按形状而非 grantMode；verdict 读 `semantic` 转换。脚本 `parseUsage` 单解析器收两种形状。
- **池规则 + 守卫（ticket 03）**：ledger 快照仅所有者可录（受益人复用 cost-share）；stream 按人。守卫补全：负数/负百分比拒绝、超额百分比明确提示（不静默封顶）、未来日期拒绝、used+percent 混传拒绝、`percent=0` 可录、`addPack` 校验 `grantedAt ≤ expiresAt`、`updateUsage` 按记录类型限定可改字段。
- **UI（ticket 04）**：盈亏/录入渲染器收敛为**两个**（ledger vs stream，取代四分支）；历史逐周期回看（详情页周期导航）；新区间无记录显示「未录入」态（取代空白）；记录页按 `semantic` 标「已用/剩余」；形态切换失真警告降级/移除。

## Testing Decisions

沿用仓储缝测试风格（真实 prisma 测试库，fileParallelism: false），只测外部行为。

- **周期模块缝（纯函数）**：周期窗口序列（月/年锚定原始日、1/31→2/28→3/31）；`periodCost` 天交集分摊（完全覆盖/部分覆盖/无覆盖/未知金额段）；年付+月重置下逐周期成本 = 年成本/12；历史回看序列与周期边界排他。先行例子：`cost-engine/index.test.ts` 风格。
- **引擎缝（纯函数）**：RESET 闭式解 = 现行 `cost × (1 − rate)` 在周期对齐时逐项相等；ledger 版在年付+月重置时给出正确分摊；`stream` 聚合（COUNT 求和 × 单价、SAVINGS 求和）回归不破坏。
- **服务缝（prisma 测试库）**：`semantic` 落库随形状；形态切换后旧记录按原语义解读（无失真）；池规则（受益人拒录快照、owner 可录）；守卫（负数/超额/未来日期/混传/percent=0/addPack 顺序）；脚本双形状落库。
- **冒烟**：浏览器走「年付订阅设月用量周期 → 录两条月快照 → 每月浪费正确 → 切形态无失真 → 历史周期回看 → 共享订阅受益人只见成本份额」全流程。

## Out of Scope

- 额度池的按人消费明细（池规则：只切成本份额，不切用量——数学上双倍计数不成立）。
- 事件流的额度/限额语义（COUNT 无"每月可看 X 部"的限额模型，维持纯事件流）。
- 脚本准入扩展到 COUNT/SAVINGS（现状仅额度；不改，除非未来有需求）。
- 快照陈旧推送提醒（webhook/email；维持原位提示）。
- 负数增量退款自动生成（SAVINGS 负增量维持增量直录路径，不加新机制）。
- STACKED 的 E1–E5 边界修复本身（原样带入本设计；是否单独立 ticket 由实现期评估）。

## Further Notes

- 周期解耦后历史数字会变（年付+月重置的浪费从整年口径改为逐月）——符合 ADR-0003 全局重算语义，预期行为。
- RESET 不物化 QuotaPack 行：单包/周期退化形态有闭式解，共享周期/分摊/快照判定即得正确结果，无表噪音。
- 四阶段（周期 → 记录语义+引擎 → 池+守卫 → UI）每阶段独立验证、可回滚，避免一次性重写把风险集中。
