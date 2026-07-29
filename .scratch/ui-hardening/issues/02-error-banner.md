# 02 — ErrorBanner 组件

**What to build:** te.tsx 新增 `<ErrorBanner error defaultMessage>`：内置 `fx` 文案（币种无汇率……），其余错误码显示 defaultMessage；error 为空不渲染。迁移全部手写橙色横幅（PaymentForm、PaymentsManager、IncomesManager、PurchaseEventsPanel、订阅向导、订阅编辑、物品新建/编辑、联合会员向导）。纯重构。

**Blocked by:** None

**Status:** resolved

- [x] ErrorBanner 实现（fx 内置，样式逐字取现行横幅）
- [x] ~8 处手写横幅全部替换，无残留
- [x] 各页 error=fx / error=1 渲染与之前一致

## Answer

te.tsx 新增 `<ErrorBanner error defaultMessage className?>`（fx 内置文案，error 空不渲染，样式逐字取现行横幅；margin 差异经 className 保持逐像素）。9 处手写横幅全部迁移（PaymentForm/PaymentsManager/IncomesManager/PurchaseEventsPanel/订阅向导与编辑/物品新建与编辑/联合会员向导）。194 测试全绿，lint 基线不变；冒烟 error=fx 与 error=1 两变体渲染正确。
