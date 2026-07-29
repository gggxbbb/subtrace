# 08 — 删除确认统一为两步按钮

**What to build:** 收敛 destructive 确认为自绘两步按钮（确认/算了，PurchaseHeaderActions 现行模式），抽取为共享组件；替换 PaymentsManager 与 PaymentHistory 的 native `confirm()` 删除。其余删除入口已用两步模式，核查无漏。

**Blocked by:** None

**Status:** ready-for-agent

- [ ] ConfirmButton 共享组件（两步：删除 → 确认删除/算了）
- [ ] 全站无 native confirm() 残留
- [ ] 删除流程行为不变（二次确认后才执行）
