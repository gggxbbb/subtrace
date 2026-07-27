# 06 — 全站深度移动端适配

**What to build:** 全站（含 login/register 与全部 (app) 路由）按 ADR-0009 落地移动端适配。断点 `md`：<md 使用移动导航——底部 tab 栏承载工作台 5 项（控制台/订阅/联合会员/物品/报表，高亮当前页），汉堡抽屉承载完整导航树（含设置组及 admin/trusted 权限门控）；≥md 保持现有固定侧边栏布局，768–1024 中间档内容网格降列（如物品卡片 3→2 列）。表格混合策略：订阅/物品列表页 <md 默认渲染卡片视图（复用 02 的卡片组件），设置/任务/支付记录/用量记录等工具型表格加横向滚动容器。触控底线：<md 所有可点元素 ≥44px，正文与数值 ≥12px，装饰性 mono 小字保持现状。桌面 ≥1024px 布局与字号与现状完全一致。

**Blocked by:** 01 — 卡片文字溢出修复；02 — 订阅/物品页卡片↔列表视图切换；03 — 订阅/物品页排序与筛选；04 — 新建订阅四步向导

**Status:** resolved

- [x] 375px 宽度下所有路由无页面级横向滚动，导航可用，全部操作可达
- [x] 底部 tab 栏含工作台 5 项并高亮当前页；抽屉含完整导航树，权限门控项按现有规则显隐
- [x] ≥768px 显示现有侧边栏布局；≥1024px 布局与字号和现状一致
- [x] 订阅/物品列表 <md 默认卡片视图（可手动切列表，列表横滚）
- [x] 工具型表格（设置、任务、支付记录、用量记录等）容器可横向滚动
- [x] <md 可点元素最小 44px；正文/数值 ≥12px
- [x] login/register 在移动端完整可用
- [x] 控制台（KPI 网格、LED 点阵趋势图）在移动端布局合理
- [x] 375/768/1024/1440 四宽度浏览器冒烟通过

## Answer

- **导航**（Sidebar.tsx 重写）：NAV 数据与 `NavGroups` 单一来源；桌面 `aside` 加 `hidden md:flex`；新增 `MobileNav`——顶栏（汉堡）、全树抽屉（路由变化自动收起、权限门控复用）、底部 tab（工作台 5 项、56px 高、当前页黑底高亮）。layout 改 `flex-col md:flex-row`，main 加 `pb-20 md:pb-0` 避让底部 tab。
- **触控/字号底线**（globals.css，<md 媒体查询）：`main` 内 button/select/input/textarea/header 链接/td 链接 min-height 44px；`.text-[11px]` → 12px（9–10px 装饰标签不动）。login/register 在 (app) 布局外，单独加 `min-h-[44px] md:min-h-0`。
- **网格断点**：KPI 行 `grid-cols-2 lg:grid-cols-4`；卡片网格 `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`；表单/面板双列 `grid-cols-1 md:grid-cols-2`；三列表单 `grid-cols-1 sm:grid-cols-3`。
- **表格**：7 张表格统一包 `overflow-x-auto` + `min-w-[480-680px]`。
- **边距**：页头与内容容器 `px-6` → `px-4 md:px-6`。
- 冒烟：375 九路由无横向滚动；底部 tab/抽屉/门控/自动收起；768 侧边栏回归；网格 1/2/3 列断点实测；44px 触控与 12px 字号两端实测；全量测试 180/180。
