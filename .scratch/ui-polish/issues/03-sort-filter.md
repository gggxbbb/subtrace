# 03 — 订阅/物品页排序与筛选

**What to build:** 两个列表页的面板上方增加工具栏：排序字段下拉 + 升/降切换 + 分类下拉（取值自现有数据）+ 状态下拉 + 关键字输入（名称包含、大小写不敏感），与视图切换按钮同行。全部状态由 URL searchParams 驱动，刷新与分享链接后保持；对卡片和列表两种视图同时生效；归档区不受影响。排序/筛选逻辑抽为纯函数（作用于成本引擎计算后的行集合，日均/月均等派生字段可排），并配单测。

**Blocked by:** 02 — 订阅/物品页卡片↔列表视图切换

**Status:** resolved

- [x] 订阅可按名称/到期日/日均/月均排序，均可升降序
- [x] 物品可按名称/购入日期/日均成本/金额排序，均可升降序
- [x] 分类、状态（订阅：正常/临期≤14d/已过期/已取消；物品：使用中/已卖出/已报废）、关键字可组合筛选
- [x] 排序与筛选状态完整反映在 URL searchParams 中
- [x] 卡片视图与列表视图下均生效，切换视图不丢筛选状态
- [x] 归档区不参与排序筛选
- [x] 纯函数单测覆盖：各排序字段升降序、各筛选维度及组合

## Answer

- 纯函数缝 `src/lib/list-query.ts`：`sortBy`（null 键恒排最后、Date/string/number 通用、不改原数组）、`subStatusOf`（与状态徽标同口径）、`matchesKeyword`。11 个单测（list-query.test.ts）。
- 新组件 `src/components/ListToolbar.tsx`：排序/升降/分类/状态/关键字，URL searchParams 驱动（`sort,dir,cat,status,q`），关键字 300ms 防抖；`ViewSwitcher` 加 `toolbar` slot 与切换按钮同行。
- 两页 server 端解析 searchParams → 过滤/排序计算后行集合（派生字段可排）；无参数时保持原有顺序（不排序）。
- `StatusPill` 改用 `subStatusOf`（lockstep），过期/临期分支内非空断言。
- 冒烟：URL 直驱排序/筛选、工具栏交互写 URL、卡片视图下同生效、物品页渲染无横向滚动。
