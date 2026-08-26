# 02 — 计数型用量快捷录入（列表行内 + 控制台今日可记）

Type: task

**What to build:** 计数型订阅的一键录入。① tuple 去重逻辑从 `UsagePanel.tsx:104-110` 抽为共享纯函数（全历史去重、最近优先），详情页与快捷组件共用；快捷按钮展示 cap 3，详情页表单维持 6 个。② 订阅列表行内（桌面表格行 + 移动卡片，44px 触控、flex-wrap）为 `usageKind === COUNT` 且 `ACTIVE` 的订阅放 ≤3 个 tuple 按钮，点击经 server action 写入 DELTA 记录：日期 = 服务器北京墙钟今日，quantity/unitPrice 取元组，单价空走现有继承链。③ 控制台 KPI 行下加"今日可记"窄条 panel：当前用户今日（北京墙钟）尚无 DELTA 记录的计数型活跃订阅 + tuple 按钮，按日均成本降序、cap 5，无待记时整个 panel 不渲染；数据并入 `getDashboardData` 聚合。失败走 `?error=` 先例。省钱型/额度型不加任何快捷钮。

**Blocked by:** 无

**Status:** resolved

- [ ] tuple 纯函数抽出共享，详情页表单行为不变（仍 6 个）
- [ ] 列表行内快捷按钮（桌面 + 移动卡片 44px），仅计数型活跃订阅
- [ ] 点击写入今日 DELTA 记录，单价继承链正确
- [ ] 控制台"今日可记"窄条：按人切片、日均降序、cap 5、记完即消失
- [ ] 北京墙钟今日边界测试（23:59/00:00 翻转）
- [ ] 省钱/额度型无快捷钮；非计数类型服务端拒绝
- [ ] 冒烟：列表 +1 → 详情出现记录 → 控制台待记消失
分工注记：列表行内快捷按钮（桌面表格 + 移动卡片）由 ListPage 完成；tuple 纯函数抽出、quickAddUsageAction 与控制台「今日可记」窄条由 QuickLogDash 完成。
