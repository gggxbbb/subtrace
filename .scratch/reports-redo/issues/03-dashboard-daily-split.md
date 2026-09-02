# 03 - 首页 KPI 订阅/物品日均拆分

Type: task

**What to build:** 首页当日日均拆分为订阅/物品两列常驻可见（非开关）。数据层已有两半（`totalDailyCost = Σ订阅日均 + itemDailyCost`），纯展示改动。

**Blocked by:** —（无）

**Status:** resolved

- [x] A1「当日总日均」副标题改为 `订阅 ¥X · 物品 ¥Y`（数据层显式导出 `subDailyCost` 字段）
- [x] 「≈每月」换算挪进 A1 卡片的悬浮 title（Kpi 新增可选 `title` prop）
- [x] A3「活跃订阅」副标题撤掉物品日均，改为纯订阅信息：`自动续费 N · 手动 M`（DashboardRow 复用已装配数据补 `autoRenew` 字段，不新增查询）
- [x] 浏览器冒烟：A1 三数（¥28.35 = 订阅 ¥10.55 + 物品 ¥17.79）同框，悬浮 title 为「≈ 每月 ¥861.71」；A3 显示「自动续费 10 · 手动 1」，无物品日均
