# 04 - CSV 导出：明细 + 实付流水

Type: task

**What to build:** 报表区间数据的两个 CSV 下载路由。

**Blocked by:** 01

**Status:** resolved

- [x] `GET /reports/export/items.csv?period=…`：名称/类型(订阅|物品)/分类/摊销成本/日均/占比，与页面明细表同口径同序
- [x] `GET /reports/export/payments.csv?period=…`：日期/名称/原币金额/币种/折算主币金额，区间内实付流水
- [x] period 参数复用 ticket 01 的解析（月 `2026-08` / 年 `2026` / 自定义起止）
- [x] UTF-8 带 BOM，Excel 打开中文不乱码；Content-Disposition 文件名带区间标签
- [x] 未登录 401/重定向；金额列数值不带千分位（对账可直接求和）
- [x] 测试：两行以上 CSV 的列序与转义（名称含逗号/引号）；空区间只出表头
