# 01 — 全口径用量录入台（控制台常驻「记用量」区）

Type: task

**What to build:** 控制台新增常驻「记用量」panel，平铺所有已开用量跟踪的活跃订阅（替代现有 COUNT-only「今日可记」窄条）。① 数据：`getDashboardData` 扩展——利用已装配的 `usageById` 输出录入台行（订阅、口径、形态、tuple cap 3、今日是否已记），删除 `pendingQuickLogs` 独立窄条数据（逻辑并入「已记」标记）。② UI：每行按口径渲染——COUNT 复用 `QuickLogButtons` tuple 钮 + 「自定义」展开（数量/单价/日期）；QUOTA 展开快照表单（RESET 剩余或已用两姿势，STACKED 只收剩余，沿用记录页形态收敛）+ 日期；SAVINGS 已省金额输入 + 日期。日期默认服务器北京墙钟今日、允许过去日期（补记一等场景）。今日已有 DELTA 的 COUNT 行显示「已记」标记而非消失。③ 写路径：复用 `addUsageAction` / `addQuotaSnapshotAction` / `addSavingsAction`，扩展可选日期入参（默认今日、拒绝未来日期）；其余守卫不变。失败走 `?error=` 先例。④ 「今日可记」panel 及其渲染代码删除（clean cutover）；列表行内 tuple 钮不动。移动端同权同方案（44px 触控）。

**Blocked by:** 无

**Status:** ready-for-agent

- [ ] 录入台列出全部口径的活跃跟踪订阅，按日均成本降序
- [ ] COUNT：tuple 一键 + 自定义展开（数量/单价/日期）
- [ ] QUOTA：RESET 剩余/已用两姿势，STACKED 只收剩余快照
- [ ] SAVINGS：已省金额，累计求差语义与详情页一致
- [ ] 日期默认今日、可补记过去、拒绝未来日期
- [ ] 今日已记 COUNT 行显示「已记」标记
- [ ] 「今日可记」窄条及其数据装配删除
- [ ] 录入后控制台与详情页数字一致（同一 usageById）
- [ ] 测试：带日期写路径（补记落库 / 未来拒绝）、已记标记边界（北京墙钟 23:59/00:00）
- [ ] 冒烟：控制台对三口径各记一笔（含一笔补记）→ 详情页出现记录
