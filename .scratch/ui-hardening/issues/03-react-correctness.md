# 03 — 三个存量 lint error 修正

**What to build:** BundleWizard 渲染期 `new Date()` → today/nextYear 改由 server 父页（bundles/new、bundles/[id]/edit）计算传入（顺带修正客户端时区 edge）；Sidebar 抽屉路由变化收起 →「渲染期间调整状态」模式（记录 prev pathname）；ViewSwitcher 的 localStorage/媒体查询 effect setState → 惰性初始化 + 同模式修正。行为不变，lint 3 error 归零。

**Blocked by:** None

**Status:** resolved

- [x] BundleWizard 不再在渲染期调 new Date()
- [x] Sidebar/ViewSwitcher 无 effect 内同步 setState
- [x] `pnpm lint` 3 个存量 error 消除（总 error 归零）
- [x] 抽屉路由变化仍自动收起；视图切换持久化行为不变

## Answer

三处修复：①BundleWizard 渲染期 new Date() → today/nextYear 改由两个 server 父页计算传入（edit 页的 Date.now() 同规则触发，一并提升为渲染前常量；顺带客户端时区 edge 消除）。②Sidebar 抽屉收起改「渲染期间调整状态」（prevPathname guard），删除 effect 与未用 import。③ViewSwitcher 重构为 apply 闭包（SSR 首帧仍 desktopDefault 保水合一致，挂载后同步 localStorage/媒体查询），规则不再触发且无需 eslint-disable。lint error 3 → 0（存量 6 warning 不变），194 测试全绿；冒烟 bundles/new 日期默认 2026-07-29 → 2027-07-29 正确。
