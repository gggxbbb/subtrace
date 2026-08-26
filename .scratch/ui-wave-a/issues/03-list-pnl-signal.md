# 03 — 订阅列表盈亏信号列

Type: task

**What to build:** 订阅列表新增当前区间盈亏列，口径与控制台红黑榜完全一致（`getUsageVerdict(sub, records, today, userId)`，同 dashboard.ts:140-166 的参数形态与按人切片）。呈现：金额 + 色——盈 `--income`、亏 `--destructive`、`costUnknown` 灰显注明、未启用用量显示 "—"；桌面表格新列与移动卡片同位置。性能：用量拉取按 dashboard 的 `Promise.all` 并行模式，STACKED 先 `reconcileAutoPacks`，禁止循环串行 await。`list-query` 排序字段新增「盈亏」（升降序，作用于派生行集合）。

**Blocked by:** 无

**Status:** resolved

- [ ] 列表渲染盈亏金额与红黑榜同值（同 fixture 两处一致）
- [ ] 盈/亏/成本未知/未跟踪四态呈现正确（语义色 token，不写 hex）
- [ ] 移动卡片视图同位置显示
- [ ] 排序字段「盈亏」升降序可用，URL searchParams 驱动（沿用 ui-polish 机制）
- [ ] 并行拉取 + reconcileAutoPacks，无 N+1
- [ ] 冒烟：列表盈亏列与控制台红黑榜数字一致
