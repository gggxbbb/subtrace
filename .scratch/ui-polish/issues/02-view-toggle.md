# 02 — 订阅/物品页卡片↔列表视图切换

**What to build:** 订阅页与物品页各增加卡片↔列表视图切换。桌面端默认保持现状（订阅=列表、物品=卡片），窄屏（<md）默认卡片；任何端可手动切换，偏好按页存 localStorage，刷新后保持，两页互不影响。订阅卡片视图字段：名称、分类、周期、到期日、日均/月均、状态；物品列表视图字段：名称、分类、购入日期、金额、日均、持有天数/回本进度、状态。产出的卡片组件同时是 06 移动端列表渲染的复用件。

**Blocked by:** None — can start immediately

**Status:** resolved

- [x] 两页均有视图切换按钮，两种视图都完整渲染全部条目
- [x] 默认视图：桌面订阅=列表、物品=卡片；<md 均为卡片
- [x] 选择按页持久化于 localStorage，刷新后保持；两页偏好互不影响
- [x] localStorage 读取不产生可见的 hydration 闪烁（挂载后校正不可感知）
- [x] 订阅卡片与物品列表的字段如上齐备，状态 LED/进度等现有视觉元素保留
- [x] 排序筛选工具栏不在本 ticket（见 03）；移动端整体适配不在本 ticket（见 06）

## Answer

- 新组件 `src/components/ViewSwitcher.tsx`：list/card 两视图由服务端渲染后以 slot 传入，组件只负责切换与持久化；无存储偏好时 <768px 默认卡片；初始 state=desktopDefault 避免 hydration mismatch，effect 内校正。
- 存储 key：`subtrace:view:subscriptions` / `subtrace:view:purchases`。
- 订阅页：表格与卡片视图拆为页内组件，状态徽标抽成共用 `StatusPill`；行类型用 `DashboardRow`（dashboard.ts 已有导出）。
- 物品页：新增表格视图（名称/分类/购入日期/金额/日均/持有/回本%/状态）；行类型 `Purchase & { daysHeld; dailyCost; progress }`（progress 为 number|undefined，与 cost-engine 一致）。
- 冒烟：两页切换→刷新持久化、key 独立、375px 视口清存储后默认卡片，均通过。
