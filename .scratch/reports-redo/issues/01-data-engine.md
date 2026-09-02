# 01 - 数据层与引擎：任意区间回看 + 双口径趋势 + 拆分

Type: task

**What to build:** 报表重做的全部数据装配与引擎扩展，带测试。

**Blocked by:** —（无）

**Status:** resolved

- [x] verdict 引擎开放任意区间入口：headline 的近 30 天窗成为特例（ADR-0015）。复用现有价值计量语义（缺价双态 valueUnknown/valuePartial、costUnknown、STACKED 浪费事件按窗过滤、重叠天数加权折算），不得新写第二套算法
- [x] `ReportData` 扩展：
  - 摊销/日均的订阅 vs 物品拆分（subAmortized / itemAmortized 或等价字段）
  - 双口径趋势序列：按桶（逐日/逐周/逐月，≤62 天逐日规则在装配层定）同时输出摊销与实付两列
  - 用量回看板块行：区间内每个量化订阅的 付了/用回/净盈亏/每次实际成本/倒计时信号/三态未知标注；区间总盈亏汇总
  - 实付流水行（日期/名称/原币金额/折算主币金额），供页面导出与展示复用
- [x] 自定义区间解析与校验（起 < 止、拒绝未来止期以外不做限制）；monthRange/yearRange 之外新增 customRange
- [x] 测试：任意区间 verdict 与近 30 天特例一致；拆分两列之和 = 总额；双口径序列桶数与粒度规则；空区间/单日区间边界

## Contract

**引擎（src/lib/usage/rolling.ts）**
- `intervalWindowOf(start: Date, end: Date, startDate: Date): RollingWindow` — 任意区间窗口，起始日晚于 start 时收窄
- `intervalVerdict(input: RollingInput, start: Date, end: Date): RollingVerdict | null` — 任意区间判定；`rollingVerdict` 是其 30 天特例（同一 `verdictInWindow` 实现）

**服务装配（src/lib/usage/service.ts）**
- `getIntervalVerdict(sub, records, window: { start: Date; end: Date }, today: Date, forUserId?: string): RollingVerdict | null`

**报表（src/lib/reports.ts）**
- `customRange(startDay: string, endDay: string): { startMs: number; endMs: number } | null` — 起/止为北京日历日，止日含（endMs = 止日+1d 排他）；起=止为单日区间；非法/起>止为 null
- `parseReportPeriod(raw: string | undefined, now?: Date): ReportPeriod | null` — 统一 period 串解析出口（页面与 CSV 路由共用）。接受：月 `2026-08` / 年 `2026` / 自定义 `2026-07-01:2026-07-31`（止日含）；缺省 = 当前月；非法格式、起>止、自定义止期在未来 → null。`ReportPeriod = { kind: "month"|"year"|"custom"; period: string; startMs: number; endMs: number; label: string }`
- `trendGranularity(numDays): "day" | "week" | "month"` — ≤62 天逐日，≤210 天逐周，否则逐月
- `getReportData(userId, startMs, endMs, periodLabel, now?: Date): Promise<ReportData>` — 新增 `now` 测试缝

**ReportData 新字段**
- `subAmortized: number` / `itemAmortized: number` — 摊销拆分（之和 = totalAmortized）
- `subDailyAvg: number` / `itemDailyAvg: number` — 日均拆分（之和 = dailyAvg）
- `trend: ReportTrendBucket[]` — `{ label: string; amortized: number; paid: number }`，逐日/逐周桶 label = 桶起日 `YYYY-MM-DD`，逐月桶 label = `YYYY-MM`
- `usageRows: ReportUsageRow[]` — `{ id; name; kind: "COUNT"|"QUOTA"|"SAVINGS"; unit: string; windowDays: number; paid: number; value: number; net: number; costPerUse: number | null; costUnknown?; valueUnknown?; valuePartial?; countdown: { kind: "reset"|"expiry"; date: string; days: number } | null }`，按 net 升序（亏的在前）
- `usageTotal: { paid: number; value: number; net: number; hasUnknown: boolean }` — 区间总盈亏汇总（KPI R4 用 net）
- `payments: ReportPayment[]` — `{ date: string; name: string; amount: number | null; currency: string; amountBase: number }` 按日期升序；amountBase 为净额（付费记录 = 快照 − 退款）；物品追加费用 name 为 `物品名 · 配件|维修|其他`
