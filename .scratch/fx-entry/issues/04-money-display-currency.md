# 04 — 金额显示跟随主币种

**What to build:** 新格式化模块导出 `fmtMoney(n, currency)`（千分位、两位小数、币种符号跟随）；删除六个本地 fmtMoney 定义与组件库的 fmt/fmtDate（日期显示统一改用既有 isoDay）；所有页面把当前用户主币种传入格式化（页面本就持有 user）。顺带修复：设非 CNY 主币种后全站仍显示 ¥ 的现行不一致。

**Blocked by:** None — can start immediately

**Status:** resolved

- [x] `fmtMoney(n, currency)` 单一实现；语义取多数派（toLocaleString 千分位）
- [x] 六处本地 fmtMoney + 组件库 fmt/fmtDate 删除，无残留引用
- [x] 全站金额显示接入 user.baseCurrency（dashboard、订阅、物品、联合会员、报表、设置各页）
- [x] fmtDate 调用方全部改 isoDay，渲染结果逐字不变
- [x] 冒烟：主币种设 USD 后各页金额符号随动

## Answer

`src/lib/format.ts` 导出 `fmtMoney(n, currency)`（toLocaleString 千分位）。六处本地 fmtMoney 与 te.tsx 的 fmt/fmtDate 全删（日期调用方改 lib/dates.isoDay，渲染逐字不变）；8 个服务器页面经 codemod 全量改接（cur = user.baseCurrency，列表页 helper 组件加 cur prop），7 个客户端面板（PaymentHistory/PaymentsManager/UsageVerdictPanel/PurchaseEventsPanel/PurchaseIncomePanel/IncomesManager/BundleWizard）加 currency prop 由父页传入。顺带修复 UsageVerdictPanel 的 ¥0 硬编码。186 测试全绿，tsc 无错误，lint 维持存量 10 项（干净树同）。冒烟：dev 库主币种设 USD 后 dashboard/订阅/报表/订阅详情四页全部渲染 US$、零 ¥，已还原 CNY。
