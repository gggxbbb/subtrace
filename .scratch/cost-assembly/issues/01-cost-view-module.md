# 01 — 订阅成本视图模块

**What to build:** 订阅概念下的成本装配模块：`costView(订阅, 视角用户, 今日)` 返回全量视图（成本段序列、覆盖段、到期日、我的份额、当日费率、我的当日费率、金额未知标记、推算段行）；`costOverPeriod` 返回区间按天摊销序列与分类/逐项聚合（算法取自既有报表切片）；`paidNet`（金额 − 退款，未知按 0）与 `paidInPeriod`。覆盖谓词收进成本引擎导出。配 DB fixture 单测。

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [ ] costView 全字段实现：segments/covering/expiry/share/dailyRate/myDailyRate/costUnknown/estimatedRows
- [ ] 覆盖谓词成本引擎导出，单一实现
- [ ] costOverPeriod 按天切片与既有报表算法等价（测试锁定）
- [ ] paidNet 三态（正常/退款/未知）与 paidInPeriod
- [ ] DB fixture 测试：份额切片（所有者/受益用户/纯设备）、金额未知、推算段
