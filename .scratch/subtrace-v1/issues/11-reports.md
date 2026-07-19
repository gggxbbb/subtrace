# 11 — 报表页

**What to build:** 报表页：月度/年度支出汇总、分类占比、支出趋势图（成本段按天切片聚合计入主币种）。

**Blocked by:** 03 订阅核心链路

**Status:** resolved

## Answer

/reports 报表页：月/年视图切换（period=YYYY-MM | YYYY，prev/next 翻页），KPI（摊销成本/实付/日均/分类数），趋势图（区间内逐日摊销柱，今天橙色，年视图也保逐日粒度），分类占比条（订阅分类 + 物品一类）。装配 src/lib/reports.ts：订阅段 ∩ 区间按天折算 × 份额（ADR-0003 shareForViewer），物品持有期 ∩ 区间逐日 purchaseDailyRate；实付单列（自有订阅付费 + 物品买入/追加事件）。

- [x] 月度/年度视图切换
- [x] 按分类占比（订阅分类 + 物品）
- [x] 趋势图展示区间内每日摊销成本
