# 02 — 调用方迁移与死代码清除

**What to build:** 五处调用方迁移到成本视图模块：dashboard（行装配、趋势循环改为消费 costOverPeriod——30×N 次分段降为 N 次、月度/年度实付走 paidInPeriod）、报表（区间切片委托新模块，保留页面装配职责）、用量盈亏（覆盖段与份额切片）、物品 TCO（份额成本）、订阅详情页（视图装配含推算段行与实付合计）。删除成本引擎 shareOf（生产零调用）与 dashboard 自写的 rateOn。行为保持：迁移前后四页数字一致。

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] dashboard/reports/usage/purchases/订阅详情页全部迁移，无直接引擎编排残留
- [ ] shareOf 与 rateOn 删除，无残留引用
- [ ] 趋势循环不再按天重算 costSegments
- [ ] 既有测试套件全绿（行为不变式）
- [ ] 冒烟：dashboard、报表、订阅详情、物品详情数字与迁移前一致
