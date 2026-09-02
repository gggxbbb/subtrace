# 03 - 首页 KPI 订阅/物品日均拆分

Type: task

**What to build:** 首页当日日均拆分为订阅/物品两列常驻可见（非开关）。数据层已有两半（`totalDailyCost = Σ订阅日均 + itemDailyCost`），纯展示改动。

**Blocked by:** —（无）

**Status:** ready-for-agent

- [ ] A1「当日总日均」副标题改为 `订阅 ¥X · 物品 ¥Y`（订阅日均 = totalDailyCost − itemDailyCost，或数据层直接导出 subDailyCost 字段——二选一，优先显式字段）
- [ ] 「≈每月」换算挪进 A1 卡片的悬浮 title
- [ ] A3「活跃订阅」副标题撤掉 `物品 N 件 · 日均 Y`（与 A1 重复），改为纯订阅信息（如自动续费/手动条数或到期最近者，实现时从现有字段选，不新增查询）
- [ ] 浏览器冒烟：A1 三数（总日均 + 订阅 + 物品）同框，A3 无物品日均
