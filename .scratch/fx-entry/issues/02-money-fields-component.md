# 02 — 金额录入组件 MoneyFields

**What to build:** 客户端金额录入组件：受控三件套（原币金额 + 币种 + 折算主币种），汇率预填内置（金额/币种失焦调用既有汇率查询 action；用户手改后不再覆盖；查无汇率或同主币种时清掉自动值）。支持 `prefix`（字段名前缀）、`allowUnknown`（金额留空 = 未知）、默认值、紧凑/网格布局。删除 attachRatePrefill 脚本与 PrefillForm 包装组件。

**Blocked by:** None — can start immediately（与 01 并行；联调在 03）

**Status:** ready-for-agent

- [ ] 三件套渲染 + 前缀字段名（prefix="first" → firstAmount/firstCurrency/firstAmountBase）
- [ ] 失焦预填：两位小数；手改不覆盖；无汇率清自动值
- [ ] `allowUnknown` 时金额框带「留空 = 未知」占位
- [ ] attachRatePrefill 与 PrefillForm 删除，无残留引用
- [ ] 紧凑（行内多栏）与网格两种布局覆盖现有全部表单形态
