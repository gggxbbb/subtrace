# 01 — 成本引擎（TDD 纯函数模块）

**What to build:** 无 DB/框架依赖的成本引擎纯函数模块：成本段合成（付费记录 → 段，未记账推算周期按标准价补齐合成段）、到期日推算（日历周期锚定原始日 + 固定天数周期 + 手动模式）、退款净额、物品回本模型（寿命内固定费率/超期摊至今日/卖出扣残值）、受益人权重分摊、按服务区间按人盈亏（用量×替代单价−已摊成本、每次实际成本）。遵循 ADR-0001/0002/0003/0004。

**Blocked by:** None — can start immediately

**Status:** resolved

- [x] Vitest 基建就绪（单命令跑测试）
- [x] 记录驱动到期日：最后一笔付费的 periodEnd 决定到期日；无记录时按锚定日期+周期推算第一个 ≥ 今天的日期
- [x] 日历周期跨月锚定（1月31日月付仍为31日，2月取月末）；固定天数周期正确
- [x] 手动模式无推算，到期日完全来自付费记录
- [x] 未记账推算周期按标准价计入成本段；付费记录按实付净额（扣退款）
- [x] 物品回本模型三态 + 残值
- [x] 权重分摊：改权重全局重算
- [x] 按区间按人盈亏与每次实际成本
- [x] 外币记录只读主币种快照

## Answer

实现于 `src/lib/cost-engine/`（index.ts + index.test.ts），25 条行为测试全绿，tsc 通过。
公共 API：`currentExpiry` / `advanceCycle` / `costSegments` / `segmentDailyRate` / `currentDailyRate` / `purchaseDailyRate` / `purchaseCurrentDailyRate` / `breakevenProgress` / `shareOf` / `verdict` / `actualCostPerUse` / `dayDiff`。
外币快照为类型级保证：`PaymentRec` 只有 `amountBase`，引擎无法接触原币与汇率。
审查修正一处：`costSegments` 对乱序付费记录先按 periodStart 排序再合成段。
提交：见 git log（ticket 01 提交）。
