# 05 — 双态验收与色板微调

**What to build:** 浏览器逐页深色预览（dashboard、订阅列表/详情、物品、联合会员、报表、设置各页、登录页、向导），核对：对比度、LED 点阵可读性、推算段虚线带、hover/选中反转、body/overscroll 底色。微调 spec 色板值（只改 globals.css 变量），记录最终值。浅色态回归抽查。

**Blocked by:** 02, 03, 04

**Status:** resolved

- [x] 深色态全页面目检通过（无明显对比度/反转事故）
- [x] 微调后色板最终值写回 spec
- [x] 浅色态抽三页截图与迁移前一致
- [x] 全套件 + tsc + lint 绿

## Answer

深色逐页面检（dashboard/订阅列表/详情/报表/登录/向导/联合会员/设置）发现并修复两处：①faint 深底 #6E6B66 对 surface 仅 ≈2.3:1（付费行元信息不可读）→ 调亮 #83807A（≈2.7:1，与浅色 neutral-400 相对层级一致）；②报表趋势柱字面 #111 在深底隐形 → var(--ink)（浅色 #000 与原 #111 差 1/255，记此）。dashboard LedTrendChart 的 bg-[#111] 黑带经评估**保留**：物理 LED 屏硬件隐喻，深态下不灭点 rgba 白光仍成立。dashboard 进度条 #999 保留（双态可读）。色板最终值已写回 spec。浅色回归：dashboard/订阅/报表 probe 全为 #E4E3E0/#FFF/#000/#737373 原值。194 测试全绿，tsc/lint 基线。
