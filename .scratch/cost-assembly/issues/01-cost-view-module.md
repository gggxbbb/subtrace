# 01 — 订阅成本视图模块

**What to build:** 订阅概念下的成本装配模块：`costView(订阅, 视角用户, 今日)` 返回全量视图（成本段序列、覆盖段、到期日、我的份额、当日费率、我的当日费率、金额未知标记、推算段行）；`costOverPeriod` 返回区间按天摊销序列与分类/逐项聚合（算法取自既有报表切片）；`paidNet`（金额 − 退款，未知按 0）与 `paidInPeriod`。覆盖谓词收进成本引擎导出。配 DB fixture 单测。

**Blocked by:** None — can start immediately

**Status:** resolved

- [x] costView 全字段实现：segments/covering/expiry/share/dailyRate/myDailyRate/costUnknown/estimatedRows
- [x] 覆盖谓词成本引擎导出，单一实现
- [x] costOverPeriod 按天切片与既有报表算法等价（测试锁定）
- [x] paidNet 三态（正常/退款/未知）与 paidInPeriod
- [x] DB fixture 测试：份额切片（所有者/受益用户/纯设备）、金额未知、推算段

## Answer

实现于 `src/lib/subscriptions/cost-view.ts`：`costView`（segments/covering/expiry/share/dailyRate/myDailyRate/costUnknown/estimatedRows，引擎输入只映射一次）、`costOverPeriod`（段算一次按天切片 + 分类/逐项聚合，算法与既有报表一致）、`paidNet`/`paidInPeriod`（北京日界过滤）。覆盖谓词 `coversDate` 收进 cost-engine 导出（dayDiff 归一语义，与原 currentDailyRate 逐字等价）并被其复用；`PurchaseWithEvents` 类型补 export。7 条 DB fixture 测试全绿（付费段/推算段/金额未知/共享两半/区间切片/实付三态），tsc 无错误。
