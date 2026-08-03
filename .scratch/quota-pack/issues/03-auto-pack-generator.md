# 03 — AUTO 包生成器（读时对齐）

**What to build:** 周期模式订阅的额度包自动生成（ADR-0012 读时对齐）：每次推演/展示前，按锚定日期 + 计费周期 + 每周期下发量 + 包有效期推导「订阅开始 → today」的应有 AUTO 包，与库中 AUTO 行对账——缺的补、锚点改写后对不上的未来包删了重生成、已过去的包不动、MANUAL 行（赠送包）永不触碰；未来包不物化（「下期将下发」展示临时推导）。手动模式订阅跳过生成，配置页引导改用周期模式。可演示：周期模式像素蛋糕订阅（每月 30 张 / 12 个月有效）设包叠加后打开详情页，即见按月生成至今天的 AUTO 包及各包到期日；录入一笔带服务止期的续费（锚点改写）后，未来包按新锚点重排。

**Blocked by:** 02 — 包叠加核心闭环（依赖 QuotaPack 表、配置字段与推演接线点）

**Status:** resolved

- [x] 生成器读时对齐：补齐到 today、不物化未来包、对账幂等（重复触发不产生重复包）
- [x] 锚点改写（录入带服务止期的付费记录）后未来 AUTO 包重排，已过去的包不动
- [x] MANUAL 行不受对账影响；手动模式订阅跳过生成并在配置页引导改用周期模式
- [x] 服务缝测试（prisma 测试库）：按月补齐、幂等、锚点重排、MANUAL 行不动、手动模式不生成
- [x] 冒烟：周期模式订阅设包叠加 → 详情页见 AUTO 包列表与到期日 → 录续费 → 未来包重排

## Answer

**实现位置**：
- 生成器：`src/lib/usage/service.ts`——`reconcileAutoPacks(subscriptionId, today)`（读时对账）+ `nextAutoGrant(sub, today)`（「下期将下发」临时推导）+ 模块内 `grantSchedule`（无界发放计划序列）/ `autoPackConfig`（生成前提守卫）。测试 `src/lib/usage/service.test.ts` 新增 9 例（本文件 48 例绿，相关 4 文件 82 例绿 + tsc 净）。
- 读路径接线：详情页 `page.tsx`（`getSubscription` 前先对账，quotaPacks include 即为新数据；PacksPanel 传 `nextGrant`）；dashboard `src/lib/dashboard.ts`（STACKED 订阅先对账再刷新内存 quotaPacks，verdict/红黑榜才看得到新包）。
- UI：`PacksPanel.tsx` AUTO 只读列表接真数据 + 「下期将下发 +N」行（未来包不物化，仅展示）。
- 写路径零触发点：录付费改锚点后不需任何动作，下次读自动对账（读时对齐的本意）。

**关键决策**：
- **发放计划 = 链式周期推进，复用 `advanceCycle`**：首笔付费前从起始日推进（截断到首笔起期）→ 各付费区间内从区间起期推进 → 末笔后从最后止期（=锚点）链式推进。锚点改写（ADR-0001）天然生效，不另造推算逻辑。每段链以 `advanceCycle(base, cycle, n)` 从基点推——链式 `advanceCycle(prev, 1)` 会让 31 号月付漂移（2/28 → 3/28），从基点推才锚定原始日（2/28 → 3/31），与 `currentExpiry` 同口径。
- **「已过去的包不动」= 已到期（expiresAt ≤ today，含今天——排他约定）**：已物化的包发放日必然 ≤ today，若按发放日定义「过去」则永远删不了包、重排不成立。已到期的包历史已被快照校准，即使与新计划对不上也不删；存活但对不上（ grantedAt/quantity/expiresAt 任一不符）的删了按新计划重生成。
- **对账比较含 quantity 与 expiresAt**：改配置（下发量/有效期）后存活包也会重生成，不只是锚点改写。
- **expiresAt = 下发日 + packValidMonths 日历月**：复用 `advanceCycle(g, {calendar, month, count}, 1)`，各包按自身下发日推（2/28 发的包 3/28 到期）；原始值落库，停订截断仍在推演时。
- **手动模式跳过 = 守卫自然无操作**：`autoPackConfig` 要求 CYCLE + QUOTA + STACKED + quotaTotal/packValidMonths 齐全；02 的配置层已清空手动模式的两字段，双重保险。配置页引导文案 02 已在向导里。
- **缺配置不生成**：STACKED 但没填 quotaTotal 或 packValidMonths 时无操作（测试锁定）。

**坑**：
- `dayDiff(a, b) = b − a`：第一版把「g > today 即停」写成 `dayDiff(t, g) < 0`（实为 g < today），测试当场抓住——`currentExpiry` 里 `dayDiff(today, candidate) >= 0` 才是「candidate ≥ today」。
- 支付表单不是页面第一个 form（头部状态表单在前）：`querySelector('form')` 会抓错，必须 `input[name=periodStart].closest('form')` 作用域。
- 浏览器实付金额用 native setter 改成 300 后落库仍是 25（MoneyFields 受控 + amountBase 联动），日期字段无碍；冒烟关键路径（服务起止 → 锚点）不受影响，未深追。

**冒烟观察**（gggxbbb，周期月付 ¥25 像素蛋糕（AUTO 包冒烟），2026-03-01 起、每月 30 张 / 12 个月有效）：打开详情页即见额度包卡 6 个 AUTO 包（03-01 发 → 2027-03-01 到期 … 08-01 发 → 2027-08-01 到期）+「下期将下发 +30 张 2026-09-01」→ 记一笔付费（服务起 2026-07-20、服务止 2027-07-20，锚点改写）→ 当前到期日变 2027-07-20，AUTO 列表 08-01 包消失、新增 07-20 发 → 2027-07-20 到期，下期将下发变 2026-08-20，3/1~7/1 包不动（重排只动存活且对不上的）→ 多次刷新包数恒为 6（幂等）→ dashboard 红黑榜出现「像素蛋糕（AUTO 包冒烟） 余额 0 张 · 区间浪费 0.00」参与排序。冒烟订阅留在 dev 库（id smoke03cakemscpopwm）供后续票复用。

未 commit（主会话统一提交）。
