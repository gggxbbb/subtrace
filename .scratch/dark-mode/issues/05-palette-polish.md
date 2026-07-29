# 05 — 双态验收与色板微调

**What to build:** 浏览器逐页深色预览（dashboard、订阅列表/详情、物品、联合会员、报表、设置各页、登录页、向导），核对：对比度、LED 点阵可读性、推算段虚线带、hover/选中反转、body/overscroll 底色。微调 spec 色板值（只改 globals.css 变量），记录最终值。浅色态回归抽查。

**Blocked by:** 02, 03, 04

**Status:** ready-for-agent

- [ ] 深色态全页面目检通过（无明显对比度/反转事故）
- [ ] 微调后色板最终值写回 spec
- [ ] 浅色态抽三页截图与迁移前一致
- [ ] 全套件 + tsc + lint 绿
