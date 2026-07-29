# 03 — 三个存量 lint error 修正

**What to build:** BundleWizard 渲染期 `new Date()` → today/nextYear 改由 server 父页（bundles/new、bundles/[id]/edit）计算传入（顺带修正客户端时区 edge）；Sidebar 抽屉路由变化收起 →「渲染期间调整状态」模式（记录 prev pathname）；ViewSwitcher 的 localStorage/媒体查询 effect setState → 惰性初始化 + 同模式修正。行为不变，lint 3 error 归零。

**Blocked by:** None

**Status:** ready-for-agent

- [ ] BundleWizard 不再在渲染期调 new Date()
- [ ] Sidebar/ViewSwitcher 无 effect 内同步 setState
- [ ] `pnpm lint` 3 个存量 error 消除（总 error 归零）
- [ ] 抽屉路由变化仍自动收起；视图切换持久化行为不变
