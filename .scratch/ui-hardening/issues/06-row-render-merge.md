# 06 — 付费/收益行渲染合并

**What to build:** 付费记录：PaymentHistory 与 PaymentsManager 的行展示与编辑表单收敛为一个共享模块（行类型、展示行、编辑表单字段），两处面板改为按上下文参数化使用；收益：PurchaseIncomePanel 快捷表单与 IncomesManager 的新增/行渲染收敛。删除重复实现，纯重构，渲染逐像素不变。

**Blocked by:** None

**Status:** resolved

- [x] 付费行「退 ¥x · 净 ¥y」标记与编辑表单只剩一份实现
- [x] 收益新增表单只剩一份实现
- [x] 两页面渲染与行为（编辑/删除/金额未知徽标/推算段）不变

## Answer

付费：新共享模块 `payment-rows.tsx`（PaymentRow 类型、SOURCE_LABEL、PaymentAmount、PaymentEditFields panel/manager 双布局变体、PaymentRowDisplay showPaidAt 变体），PaymentHistory 重写为组合式、PaymentsManager 迁移，两处的「退·净」标记与编辑表单只剩一份；详情页 HistoryPayment 类型统一到 PaymentRow。收益：`income-fields.tsx` 的 IncomeFormFields（dateFlex/noteOptional 参数化三处布局差异），快捷新增与管理页新增/编辑三表单共用。逐像素约束经 variant 参数保持。194 测试全绿，lint 维持基线（0 error / 6 存量 warning）；付费两页渲染冒烟正常。
