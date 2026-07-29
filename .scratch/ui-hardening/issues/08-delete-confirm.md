# 08 — 删除确认统一为两步按钮

**What to build:** 收敛 destructive 确认为自绘两步按钮（确认/算了，PurchaseHeaderActions 现行模式），抽取为共享组件；替换 PaymentsManager 与 PaymentHistory 的 native `confirm()` 删除。其余删除入口已用两步模式，核查无漏。

**Blocked by:** None

**Status:** resolved

- [x] ConfirmButton 共享组件（两步：删除 → 确认删除/算了）
- [x] 全站无 native confirm() 残留
- [x] 删除流程行为不变（二次确认后才执行）

## Answer

`src/components/ConfirmButton.tsx`（两步：删除 → 确认删除/算了，样式三 props 保各点视觉）。迁移：payment-rows 行删除（PaymentHistory/PaymentsManager 随之去掉 confirm()）、BundleRowActions、ArchivedList、ArchivedPurchaseList、PurchaseHeaderActions、UsersTable 删除用户。保留：UsageWizard 的清除记录确认（form 提交形态，非按钮模式）。全站无 native confirm() 残留；194 测试全绿，lint 基线；冒烟 删除→确认删除/算了→取消回退 全链路。
