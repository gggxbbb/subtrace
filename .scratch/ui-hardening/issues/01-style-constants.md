# 01 — 样式常量收敛进 te.tsx

**What to build:** te.tsx 导出 `inputCls`/`labelCls`/`btnCls`（与各组件现行定义逐字一致），~15 个客户端组件删除本地定义改 import。纯重构，渲染逐像素不变。

**Blocked by:** None

**Status:** resolved

- [x] te.tsx 导出三个样式常量（取多数派定义）
- [x] 全部本地 inputCls/labelCls/btnCls 定义删除，无残留
- [x] tsc + lint 无新增问题
- [x] 抽查两页渲染与之前一致

## Answer

te.tsx 导出 inputCls/labelCls（多数派定义），16 个文件 codemod 迁移完毕。btnCls 未导出：三处定义互不相同（BundleRowActions/PurchasePanels/ChannelsPanel），统一会破坏逐像素约束，保留本地。设置区密集变体（ChannelsPanel/RatesPanel/ScriptEditor 的 px-3 py-2 + text-[9px]）同为有意变体，保留本地。194 测试全绿，lint 维持基线；抽查 subscriptions/new 渲染（1px 黑边、#E4E3E0 底、10px 标签）一致。
