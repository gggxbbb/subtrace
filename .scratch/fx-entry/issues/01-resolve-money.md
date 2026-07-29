# 01 — 金额解析模块 resolveMoney

**What to build:** 服务端金额解析模块：输入 FormData（可带字段名前缀）与当前用户，输出 `{ amount, currency, amountBase }`，按 ADR-0010 决策树兜底——币种空/同主币种 → 快照=原币金额；外币手填折算 → 用手填值；外币未手填有汇率 → 查汇率表计算（两位小数）；外币未手填无汇率 → 抛出带 fx 错误码的结构化错误。`allowUnknown` 模式下金额留空输出三字段全 null（ticket 12 语义）。配全套单测。

**Blocked by:** None — can start immediately

**Status:** resolved

- [x] 决策树四分支全部实现且各有测试
- [x] 手填折算值永远优先于服务端计算
- [x] 服务端计算与预填同口径（rateToBase、两位小数）
- [x] `allowUnknown` 输出三 null；金额未知时币种强制 null
- [x] 前缀字段解析（如 `firstAmount`/`firstAmountBase`）
- [x] 无汇率拒绝的错误可被 action 层映射为 `?error=fx`

## Answer

实现于 `src/lib/money.ts`：`resolveMoney(formData, user, opts)` 按 ADR-0010 决策树产出 `{ amount, currency, amountBase }`——同主币种正当 1:1、手填折算永远优先、外币未手填查 `getRate` 服务端计算（round2）、无汇率抛 `NoRateError`（`code: "fx"`，供 action 映射 `?error=fx`）。`allowUnknown` 输出三 null（ticket 12），必填缺失抛 `BadAmountError`。字段名支持 `prefix`（首字母大写拼接）与显式 `names`（标准价等非同构命名）。6 条决策树测试全绿（`src/lib/money.test.ts`），tsc 无错误。
