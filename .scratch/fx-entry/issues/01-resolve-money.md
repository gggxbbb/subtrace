# 01 — 金额解析模块 resolveMoney

**What to build:** 服务端金额解析模块：输入 FormData（可带字段名前缀）与当前用户，输出 `{ amount, currency, amountBase }`，按 ADR-0010 决策树兜底——币种空/同主币种 → 快照=原币金额；外币手填折算 → 用手填值；外币未手填有汇率 → 查汇率表计算（两位小数）；外币未手填无汇率 → 抛出带 fx 错误码的结构化错误。`allowUnknown` 模式下金额留空输出三字段全 null（ticket 12 语义）。配全套单测。

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [ ] 决策树四分支全部实现且各有测试
- [ ] 手填折算值永远优先于服务端计算
- [ ] 服务端计算与预填同口径（rateToBase、两位小数）
- [ ] `allowUnknown` 输出三 null；金额未知时币种强制 null
- [ ] 前缀字段解析（如 `firstAmount`/`firstAmountBase`）
- [ ] 无汇率拒绝的错误可被 action 层映射为 `?error=fx`
