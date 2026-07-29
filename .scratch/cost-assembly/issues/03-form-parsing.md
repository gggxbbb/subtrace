# 03 — 表单解析模块 dayField/numField

**What to build:** 表单解析模块：`dayField`（委托 ADR-0008 指定的 parseDay 统一构造）与 `numField`（空串/非数 → undefined）。订阅、物品、用量、联合会员四个 action 的内联 parseDate/parseNum 删除迁移。提醒天数字段语法为订阅专属，留在订阅 action 原处。补边界单测（空串、非数、非法日期）。

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [ ] dayField/numField 实现 + 边界单测
- [ ] 四个 action 的内联 parseDate/parseNum 全删，无 `T00:00:00+08:00` 内联残留
- [ ] 提醒天数解析保留在订阅 action 且行为不变
- [ ] 既有测试套件全绿
