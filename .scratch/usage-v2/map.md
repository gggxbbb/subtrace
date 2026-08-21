# 用量模型 v2

Notes / Decisions-so-far / Fog。子 ticket 见 `issues/`。设计源：ADR-0013 + spec。

## Decisions so far

- **D1 双引擎**：`ledger`（额度）与 `stream`（事件）；`usageKind`/`grantMode` 是配置值不是代码分叉。SAVINGS 保留薄壳共用 stream，不合并 COUNT 枚举。
- **D2 周期解耦**：`usageCycle`（unit/count/anchor）独立于计费成本段；周期成本按 `segmentDailyRate` 天交集分摊；QUOTA 缺省回退计费周期（月付零感知）。
- **D3 记录语义随记录走**：`UsageRecord.semantic`（USED/REMAINING）；存量 RESET→USED、STACKED→REMAINING；形态切换不再失真。
- **D4 单一池规则**：ledger 池级（仅 owner 录快照，受益人只切成本份额）；stream 按人。
- **D5 脚本契约按引擎收口**：ledger 收 `{remaining}` 原生 + `{used,total?}` 适配器，单解析器。
- **等价性**：RESET 闭式解 = `periodCost × (1 − used/total)`，周期对齐时与现行 `cost × (1 − rate)` 逐项相等；不对齐时给出正确分摊。RESET 不物化 QuotaPack。

## 阶段分解

- **01 周期解耦**：schema `usageCycle` + `usage/period.ts`（周期窗口 + periodCost 分摊）+ RESET/COUNT/SAVINGS verdict 切换周期窗口与分摊成本。独立纯引擎测试。Blocked: None。
- **02 记录语义 + 引擎收口**：schema `UsageRecord.semantic` + 迁移打标 + `addQuotaSnapshot` 按形状定语义 + verdict 按引擎（ledger 泛化 / stream）+ 脚本单解析器。Blocked: 01。
- **03 池规则 + 守卫**：ledger 仅 owner 录快照；补全 B 类守卫。Blocked: 02。
- **04 UI + 历史回看**：渲染器收敛两套、周期导航历史回看、未录入态、semantic 标签、失真警告降级。Blocked: 03。

## Fog

- STACKED 是否单独立 ticket 补 E1–E5（到期日当天合成快照、无快照区分、同日多快照、续费复活回跳）——实现期评估，未排入本设计主线。
- CONTEXT.md「用量 / 额度包 / 发放形态 / 用量脚本」词条需随实现同步（ADR-0013 已引用）。
- `getUsageVerdict` 当前四变体（Count/Quota/Savings/Pack）合并后 verdict 判别字段是否需要收敛——ticket 04 UI 时定。
