# 01 — 样式常量收敛进 te.tsx

**What to build:** te.tsx 导出 `inputCls`/`labelCls`/`btnCls`（与各组件现行定义逐字一致），~15 个客户端组件删除本地定义改 import。纯重构，渲染逐像素不变。

**Blocked by:** None

**Status:** ready-for-agent

- [ ] te.tsx 导出三个样式常量（取多数派定义）
- [ ] 全部本地 inputCls/labelCls/btnCls 定义删除，无残留
- [ ] tsc + lint 无新增问题
- [ ] 抽查两页渲染与之前一致
