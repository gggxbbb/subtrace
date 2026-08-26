# 01 — 空面板收高

Type: task

**What to build:** grid 双列行加 `items-start` 让面板高度自适应内容：`dashboard/page.tsx` 的 04/05 与 06/07 两行、订阅详情页 `[id]/page.tsx` 的双列行（01 记一笔/02 付费历史、03 用量/04 盈亏）。`Panel` 组件不动。归档 0 条不渲染：订阅列表 `ArchivedList`、物品列表 `ArchivedPurchaseList` 的调用点加 `archived.length === 0` 判断整个不渲染，两组件内的空态文案随之删除（死代码）。

**Blocked by:** 无

**Status:** resolved

- [x] 控制台 04/05、06/07 两行 `items-start`（实际布局：04/05 所在 `md:grid-cols-2` 行已加 `items-start`；06 回本进度与 07 订阅明细是堆叠的整宽 Panel，不存在双列 grid，无需处理）
- [x] 详情页双列行同样处理（01 记一笔/02 付费历史与 03 用量/04 盈亏两行均加 `items-start`）
- [x] 订阅列表/物品列表归档为 0 时归档 Panel 不渲染，空态文案死代码删除
- [x] 其余空态 strip（`px-4 py-6`）保持原样
- [x] 冒烟：06/07 实为整宽堆叠，本就互不拉伸；04/05 行经 `items-start` 已收高，`pnpm exec tsc --noEmit` 通过
