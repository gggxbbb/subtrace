# 03 — 数值字号三档层级

Type: task

**What to build:** 应用数值三档层级（L1 hero 28px bold 现状不动；L2 行内主数 `text-[13px] font-semibold tabular-nums`；L3 辅助数 `text-[11px] text-muted tabular-nums f-mono`）。订阅列表桌面表格：日均列升 L2、盈亏列升 L2（保留盈青/亏红/未知灰配色）、月均列降 L3；移动卡片同步这三个数。报表明细表（`reports/page.tsx` 03 明细）：摊销成本列升 L2、日均列降 L3。不动详情页 KPI/盈亏面板、控制台红黑榜、表单与 9-10px 装饰标签。

**Blocked by:** 无

**Status:** resolved

- [x] 订阅列表桌面表格日均/盈亏 L2、月均 L3
- [x] 移动卡片同三个数同步调整
- [x] 报表明细摊销成本 L2、日均 L3
- [x] 语义色 token 不变，不引入 hex
- [x] 详情页/控制台/表单区域零改动
- [x] 冒烟：1280 列表/报表 + 390 卡片截图确认——日均/盈亏 L2 主数先落，月均 L3 退后；移动卡片 L2 字型与桌面对齐（去掉继承 f-mono）
