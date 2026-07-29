# 02 — 调用方迁移与死代码清除

**What to build:** 五处调用方迁移到成本视图模块：dashboard（行装配、趋势循环改为消费 costOverPeriod——30×N 次分段降为 N 次、月度/年度实付走 paidInPeriod）、报表（区间切片委托新模块，保留页面装配职责）、用量盈亏（覆盖段与份额切片）、物品 TCO（份额成本）、订阅详情页（视图装配含推算段行与实付合计）。删除成本引擎 shareOf（生产零调用）与 dashboard 自写的 rateOn。行为保持：迁移前后四页数字一致。

**Blocked by:** 01

**Status:** resolved

- [x] dashboard/reports/usage/purchases/订阅详情页全部迁移，无直接引擎编排残留
- [x] shareOf 与 rateOn 删除，无残留引用
- [x] 趋势循环不再按天重算 costSegments
- [x] 既有测试套件全绿（行为不变式）
- [x] 冒烟：dashboard、报表、订阅详情、物品详情数字与迁移前一致

## Answer

五处调用方迁移完成：dashboard（行/到期用 costView 点视图且每订阅只算一遍，trend 改 costOverPeriod——30×N 次分段降为 N 次，月/年实付走 paidInPeriod，rateOn 删除）、reports（区间切片委托 costOverPeriod，实付走 paidInPeriod，保留 monthRange/yearRange 与视图模型出口）、usage/service（覆盖谓词换 coversDate）、订阅详情页（装配全换 costView + paidNet，删手工 segments/estimatedRows/shareForViewer 编排）。purchases/service 的物品 TCO 份额行使用 refId 语义（shareFor）而非视角语义，按 grilling 决策保留原实现。cost-engine 的 shareOf 及其 3 条测试删除（生产零调用）。193 测试全绿，tsc 无错误。冒烟：dashboard 行 ¥3.71（115.13/31）、A1 ¥7.43、报表 7 月摊销 ¥22.28 = 2 订阅 × 3 天 × 3.71、实付 ¥230.26 = 2 × 115.13、详情页 ¥3.71/¥115.13——与迁移前算法手算一致。
