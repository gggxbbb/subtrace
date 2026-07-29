# 02 — 金额录入组件 MoneyFields

**What to build:** 客户端金额录入组件：受控三件套（原币金额 + 币种 + 折算主币种），汇率预填内置（金额/币种失焦调用既有汇率查询 action；用户手改后不再覆盖；查无汇率或同主币种时清掉自动值）。支持 `prefix`（字段名前缀）、`allowUnknown`（金额留空 = 未知）、默认值、紧凑/网格布局。删除 attachRatePrefill 脚本与 PrefillForm 包装组件。

**Blocked by:** None — can start immediately（与 01 并行；联调在 03）

**Status:** resolved

- [x] 三件套渲染 + 前缀字段名（prefix="first" → firstAmount/firstCurrency/firstAmountBase）
- [x] 失焦预填：两位小数；手改不覆盖；无汇率清自动值
- [x] `allowUnknown` 时金额框带「留空 = 未知」占位
- [x] attachRatePrefill 与 PrefillForm 删除，无残留引用
- [x] 紧凑（行内多栏）与网格两种布局覆盖现有全部表单形态

## Answer

实现于 `src/components/MoneyFields.tsx`：受控三件套（金额/币种/折算），预填内置（失焦调 `lookupRateAction`，两位小数，手改不覆盖，无汇率/同主币种清自动值）；`moneyNames(prefix)` 与 resolveMoney 命名约定同构，另支持显式 `names`；`allowUnknown`（留空=未知占位）与 grid/inline 两种布局。范围微调（与 03 重新分界）：本票迁移 5 个已接线表单（PaymentForm、PaymentsManager 新增/编辑、物品新建/编辑）并删除 `attachRatePrefill` 与 `PrefillForm`（删除以无残留引用为前提）；其余 8 个未接线表单与 action 层 resolveMoney 迁移在 03。全套件 186 测试全绿，tsc 无错误；lint 3 error 为存量（干净树复现），与本次无关。
