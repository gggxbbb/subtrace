# 03 — 表单解析模块 dayField/numField

**What to build:** 表单解析模块：`dayField`（委托 ADR-0008 指定的 parseDay 统一构造）与 `numField`（空串/非数 → undefined）。订阅、物品、用量、联合会员四个 action 的内联 parseDate/parseNum 删除迁移。提醒天数字段语法为订阅专属，留在订阅 action 原处。补边界单测（空串、非数、非法日期）。

**Blocked by:** None — can start immediately

**Status:** resolved

- [x] dayField/numField 实现 + 边界单测
- [x] 四个 action 的内联 parseDate/parseNum 全删，无 `T00:00:00+08:00` 内联残留
- [x] 提醒天数解析保留在订阅 action 且行为不变
- [x] 既有测试套件全绿

## Answer

`src/lib/form.ts`：`dayField`（委托 dates.parseDay）与 `numField`（空串/非数 → undefined），3 条边界测试。subscriptions/purchases/usage/bundles 四个 action 的内联 parseDate/parseNum 全删迁移；bundles 子会员 JSON 里的两处内联日期构造改 parseDay；money.ts 内部 num 归并为 numField。lib 层无 `T00:00:00+08:00` 内联残留（app 层 UI 筛选/日期加减的几处不在本票范围）。196 测试全绿，tsc 无错误。
