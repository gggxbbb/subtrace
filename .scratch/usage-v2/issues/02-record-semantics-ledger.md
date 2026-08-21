# 02 — 记录语义自描述 + 引擎收口（ledger/stream）

Type: task
Status: needs-triage
Blocked by: 01

## What to build

记录语义随记录走（`UsageRecord.semantic`），让形态切换不再重解读历史（ADR-0013 D3）；verdict 按引擎收口为 ledger/stream 两台（D1/D2）；脚本契约按引擎收口（D5）。

- **Schema**：`UsageRecord` 新增 `semantic String?`（TOTAL: `USED`/`REMAINING`；DELTA 空）。迁移：存量 RESET TOTAL → `USED`，STACKED TOTAL → `REMAINING`，DELTA → 空。
- **录入**：`addQuotaSnapshot` 守卫从「按 grantMode」改为「按入参形状」：收 `remaining` → `semantic=REMAINING`；收 `used` 或 `percent` → `semantic=USED`（`percent` 仍折算 `used`）。`addUsage`（DELTA）语义空。STACKED 不再强制只收 remaining、RESET 不再强制只收 used——两种形状都合法，语义随记录走。
- **verdict 引擎收口**（`getUsageVerdict`）：
  - `usage/ledger.ts`：QUOTA 统一走账本。STACKED 走 `pack-ledger` FEFO（保留）；RESET 走单包闭式解 `periodCost × (1 − used/total)`（复用 ticket 01 的周期 + 分摊 + 快照判定；不物化 QuotaPack 行）。两者共享周期窗口、分摊成本、快照状态读取。记录读 `semantic` 后统一转 remaining 视角计算。
  - `usage/stream.ts`：COUNT/SAVINGS 共用事件聚合（COUNT 求和 × 单价、SAVINGS 增量即金额求和），共享周期窗口 + 分摊成本。SAVINGS 为薄壳（`usageKind` 值 + 展示标签，引擎同一）。
  - `getUsageVerdict` 装配按引擎，`verdictAmount` 语义：ledger 浪费导向（≤0）、stream 价值导向。
- **脚本**：`src/lib/scripts/sandbox.ts` `parseUsage` 从双契约（used/remaining 按 grantMode）收口为单解析器——ledger 订阅同时接受 `{ remaining }`（REMAINING）与 `{ used, total? }`（USED），按返回形状定语义；`job.ts` 不再按 grantMode 选契约。沙箱文档、`ScriptEditor` 默认模板按「双形状皆可」同步。
- **失真警告降级**：形态切换警告改为普通提示（切换不再改变历史记录解读）。

**Non-goals**：池规则与守卫（ticket 03）；UI 渲染器收敛与历史回看（ticket 04）。

## Acceptance

- [ ] `semantic` 落库随形状；存量 RESET/STACKED/DELTA 迁移打标正确
- [ ] `addQuotaSnapshot` 两种形状（remaining/used+percent）都合法落库，语义自描述
- [ ] RESET verdict = `periodCost × (1 − used/total)`，与 ticket 01 周期窗口一致；STACKED verdict 回归不破坏
- [ ] 形态切换后旧记录按原 `semantic` 解读（写入时语义），无失真
- [ ] COUNT/SAVINGS 走 stream 引擎，数字回归；SAVINGS 薄壳标签保留
- [ ] 脚本 `{ remaining }` 与 `{ used, total? }` 对任意 grantMode 都正确落库（semantic 随形状）
- [ ] 失真警告降级为普通提示
- [ ] 服务缝/引擎缝测试全绿 + tsc 净

## 实现位置

- `prisma/schema.prisma`（`UsageRecord.semantic`）+ 迁移打标脚本
- `src/lib/usage/service.ts`（`addQuotaSnapshot` 按形状定语义、`getUsageVerdict` 引擎装配）
- `src/lib/usage/ledger.ts`（新，泛化）+ `stream.ts`（新）+ 各自测试
- `src/lib/scripts/sandbox.ts` / `job.ts` / `service.ts`（单解析器、脚本守卫、`ScriptSubView`）
- `ScriptEditor.tsx` 模板文案

## 关键决策

- 守卫按「入参形状」而非 grantMode：记录语义自描述后，形态是 UI 引导、不是数据解读依据——这是 D3 的落地点。
- RESET 不物化 QuotaPack：单包/周期退化形态有闭式解（等价性见 ADR-0013 D2），共享 ledger 的周期/分摊/快照判定即可，无表噪音。
- SAVINGS 薄壳共用 stream：引擎统一消解复杂度，枚举保留三值避免迁移面（D1）。

## 验证

服务缝测试（semantic 落库、形态切换无失真、脚本双形状）+ 引擎缝测试（RESET 闭式解 = 现行 cost×rate 在周期对齐时逐项相等）+ 全套件绿 + tsc。
