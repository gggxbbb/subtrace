# 02 — 主结构色 codemod

**What to build:** 全站硬编码主色机械迁移到语义 token：`bg-[#E4E3E0]`→bg-base、`bg-white`→bg-surface、`border-black`→border-ink、`text-black`→text-ink、`#FF5A00`（含 te.tsx ORANGE 常量、内联 style、Led 默认色、图表填充）→accent token/变量。hover/focus 变体（hover:bg-black、hover:text-white、focus:bg-white、bg-black 步骤条/按钮实底）按语义映射为 ink/surface 对应态。浅色态逐像素不变。

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] src 下无 bg-[#E4E3E0]/bg-white/border-black/text-black 残留（白名单注释除外）
- [ ] ORANGE 常量与内联 style 中的 #FF5A00 收敛
- [ ] 深色态下步骤条/实底按钮/选中态可读（ink↔surface 反转成立）
- [ ] 浅色态截图对比无差异
