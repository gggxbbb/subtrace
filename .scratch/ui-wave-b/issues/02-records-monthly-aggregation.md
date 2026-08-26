# 02 — 用量记录按月聚合带

Type: task

**What to build:** 记录管理页（`subscriptions/[id]/usage/records/`）筛选条与明细之间插入按月聚合带。纯函数 `monthlyUsageAggregation(rows)`（`lib/usage/` 新文件）：输入当前筛选后的行集，输出 `{ month: "YYYY-MM", count, total }[]` 月降序；`total = Σ quantity`（计数型 = 次数；省钱型 quantity 即已省金额，渲染层换单位与 `fmtMoney`）。月份取记录 `date`（已是北京日 ISO）前 7 位。点击月份行 = `<a href>` 回填 `from=月初&to=月末`（保留现有 userId/kind 筛选参数）GET 下钻；当前 from/to 恰好等于某月首末日时该行高亮。仅 COUNT/SAVINGS 渲染；QUOTA（含 STACKED）不渲染。聚合带跟随当前筛选（选了受益人只聚合他的）。

**Blocked by:** 无

**Status:** resolved

- [x] 纯函数测试：月分组与 Σ、月降序、跨受益人合并、省钱型同路径、空数组、跨年分桶
- [x] COUNT/SAVINGS 渲染聚合带，QUOTA/STACKED 不渲染
- [x] 点击月份回填 from/to 下钻（保留 userId/kind 参数），当前月行高亮
- [x] 聚合带随筛选结果变化（受益人筛选后只聚合其记录）
- [x] 明细列表平铺不动（编辑/删除入口保留）
- [x] 冒烟：乐刻 41 条 → 聚合带 6 个月行（2026-03..08），点 2026-04 下钻 6/41 条且行高亮；kind=TOTAL 筛选下聚合带隐藏；QUOTA（像素蛋糕 STACKED）无聚合带
