# 用量模型 v2：周期解耦 + 双引擎收口 + 记录自描述语义

现状用量跟踪是补丁堆：三口径（COUNT/QUOTA/SAVINGS）× 两发放形态（RESET/STACKED）× 两套脚本契约 × 记录语义挂在形态上 × 用量窗口硬绑计费成本段。每次新产品形态出现就新增一条正交轴，导致审计暴露的周期错配（年付+月重置算错）、共享池双倍计数、守卫缺失、历史回看只覆盖一种形态。本 ADR 把四根正交轴收口为**两个引擎 + 两条单一规则**。

## 领域还原：只有两种形状

**形状一 —— 额度账本（state-ledger）**：一个"池"，额度按块发放、随时间消耗。RESET 与 STACKED 是同一台机器：每周期发一个包，区别只在包的有效期（RESET = 周期末到期；STACKED = 若干周期后到期）。浪费 = 到期未用余额 × 单张成本。

**形状二 —— 事件流（event stream）**：随时间累积的增量，按周期求和，盈亏 = Σ增量 − 周期成本。COUNT 与 SAVINGS 是同一台机器：SAVINGS 的"增量本身就是钱"（单位 = ¥、无替代单价）。

## 决策

### D1 双引擎，不是三/四引擎
代码分叉只发生在引擎层：`ledger`（额度）与 `stream`（事件）。KIND 枚举与 grantMode 是**配置值**，不是代码分叉。`usageKind` 保留三值（COUNT/QUOTA/SAVINGS）：SAVINGS 保留薄壳（复用 stream 引擎），**不合并进 COUNT 枚举**——引擎统一已消解复杂度，枚举合并只增加迁移面、无收益。

### D2 周期与成本段解耦（修复 A1/A2/H4）
新增 `usageCycle`（`unit`/`count`/`anchor`，可空）。QUOTA 必填语义（缺省回退计费周期，典型月付用户零感知）；COUNT/SAVINGS 可选（缺省按成本段）。周期窗口、发放计划、历史回看全部由 `usageCycle` 推导。周期成本 = 成本段按天交集分摊（复用 `segmentDailyRate`）。年付 + 月重置下，每个月度周期分摊当年成本的 1/12，浪费/每单位成本随之正确。

**等价性（RESET ⊂ ledger 的数学基础）**：现行 RESET `浪费 = 段成本 × (1 − used/total)`；ledger 版 `周期末焚毁 = remaining × 单张成本 = periodCost × (1 − used/total)`。周期与成本段对齐时逐项相等；不对齐时 ledger 版给出正确的按周期分摊。故 RESET 无需物化 QuotaPack 行——单包/周期的退化形态有闭式解，走共享的周期 + 分摊成本 + 快照状态判定的公共机制即可；STACKED 的多包重叠才需要 FEFO 焚毁（`pack-ledger` 保留）。

### D3 记录语义随记录走（修复形态切换重解读）
`UsageRecord` 新增 `semantic`（`USED`/`REMAINING`；DELTA 为空）。TOTAL 记录的 quantity 含义由**记录自己**声明，verdict 读时转换。形态切换不再需要"历史快照重解读"警告——记录永远按写入时语义解读。存量迁移：现有 RESET TOTAL → `USED`，STACKED TOTAL → `REMAINING`，零重解释、零失真。

### D4 单一池规则（修复 D1 共享双倍计数）
额度（ledger）是**池级**：池的观测（快照）只由所有者录入，受益人只按权重切成本份额，不切用量/浪费。COUNT/SAVINGS（stream）按人记录、按人求和。这一条规则取代 STACKED 的池级例外与 RESET 的朴素按人切快照两处特例。

### D5 脚本契约按引擎收口
ledger 契约同时接受 `{ remaining }`（原生，语义 REMAINING）与 `{ used, total? }`（适配器，语义 USED），`parseUsage` 单一解析器；sandbox 契约分裂取消（RESET/STACKED 不再各自收一种）。

### D6 记录语义自描述后，形态守卫收口
`addQuotaSnapshot` 不再按 grantMode 分裂守卫——按**入参形状**定语义：收 `remaining` 落 REMAINING，收 `used`/`percent` 落 USED。`grantMode` 仍是 UI 层引导形态，不参与记录解读。

## Schema 变更

```prisma
// Subscription 新增（可空，零迁移）
usageCycleUnit    String?   // DAY | WEEK | MONTH | YEAR
usageCycleCount   Int?
usageCycleAnchor  DateTime? // 空 = 锚定日期（anchorDate ?? startDate）

// UsageRecord 新增
semantic  String?   // TOTAL: USED | REMAINING；DELTA 为空

// QuotaPack 不变（STACKED 已建模 grant；RESET 闭式解不物化）
```

## 模块布局

```
usage/period.ts    周期推进（复用 cost-engine advanceCycle）+ periodCost 按天分摊
usage/ledger.ts    pack-ledger 泛化（STACKED FEFO）+ RESET 闭式解（共享周期/分摊/快照判定）
usage/stream.ts    event 聚合（COUNT/SAVINGS 共用）
usage/verdict.ts   周期装配 + 历史回看 = map(usagePeriods)
```

## Consequences

- RESET verdict 窗口从"覆盖今天的成本段"改为"usageCycle 周期"，成本改为按周期分摊——历史数字随周期解耦变化，属预期行为（ADR-0003 全局重算语义）。
- 记录语义自描述后，切换形态不再失真——既有"失真警告"可降级为普通提示或移除。
- 存量 RESET 记录需迁移打 `semantic=USED` 标记；STACKED 打 `REMAINING`。
- STACKED 的 E1–E5 边界（到期日当天合成快照、无快照区分、续费复活回跳、同日多快照、剩余回升解读）原样带入，账本本身稳定；B 类守卫在新模型顺手补上。
- 历史逐周期回看对全部形态免费获得（原只有 STACKED 有 wasteEvents）。

## Considered Options

- **SAVINGS 合并进 COUNT 枚举**：引擎已统一，枚举合并只加迁移面、不加能力。拒。
- **强制 RESET 物化 QuotaPack 行**：单包/周期退化形态有闭式解，物化多一行无收益、徒增表噪音。拒。
- **记录语义仍挂形态、保留切换警告**：警告是"数据被错误解读"的遮羞布，自描述语义从根上消除。拒。
- **周期沿用计费周期、不新增字段**：无法表达年付+月重置这一核心错配场景。拒。
- **STACKED 走新 period 机制、RESET 保留旧路径**：同一引擎两套路径，重蹈补丁覆辙。拒。
- **价值导向（推算消费 × 替代单价）**：建立在窗口估计值上，不如快照钉死的浪费/实际已省可信（沿用 ADR-0012 Q9 裁决）。
