# 01 - 数据层与引擎：任意区间回看 + 双口径趋势 + 拆分

Type: task

**What to build:** 报表重做的全部数据装配与引擎扩展，带测试。

**Blocked by:** —（无）

**Status:** ready-for-agent

- [ ] verdict 引擎开放任意区间入口：headline 的近 30 天窗成为特例（ADR-0015）。复用现有价值计量语义（缺价双态 valueUnknown/valuePartial、costUnknown、STACKED 浪费事件按窗过滤、重叠天数加权折算），不得新写第二套算法
- [ ] `ReportData` 扩展：
  - 摊销/日均的订阅 vs 物品拆分（subAmortized / itemAmortized 或等价字段）
  - 双口径趋势序列：按桶（逐日/逐周/逐月，≤62 天逐日规则在装配层定）同时输出摊销与实付两列
  - 用量回看板块行：区间内每个量化订阅的 付了/用回/净盈亏/每次实际成本/倒计时信号/三态未知标注；区间总盈亏汇总
  - 实付流水行（日期/名称/原币金额/折算主币金额），供页面导出与展示复用
- [ ] 自定义区间解析与校验（起 < 止、拒绝未来止期以外不做限制）；monthRange/yearRange 之外新增 customRange
- [ ] 测试：任意区间 verdict 与近 30 天特例一致；拆分两列之和 = 总额；双口径序列桶数与粒度规则；空区间/单日区间边界
