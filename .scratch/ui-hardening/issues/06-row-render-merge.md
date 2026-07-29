# 06 — 付费/收益行渲染合并

**What to build:** 付费记录：PaymentHistory 与 PaymentsManager 的行展示与编辑表单收敛为一个共享模块（行类型、展示行、编辑表单字段），两处面板改为按上下文参数化使用；收益：PurchaseIncomePanel 快捷表单与 IncomesManager 的新增/行渲染收敛。删除重复实现，纯重构，渲染逐像素不变。

**Blocked by:** None

**Status:** ready-for-agent

- [ ] 付费行「退 ¥x · 净 ¥y」标记与编辑表单只剩一份实现
- [ ] 收益新增表单只剩一份实现
- [ ] 两页面渲染与行为（编辑/删除/金额未知徽标/推算段）不变
