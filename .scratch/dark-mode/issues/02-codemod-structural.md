# 02 — 主结构色 codemod

**What to build:** 全站硬编码主色机械迁移到语义 token：`bg-[#E4E3E0]`→bg-base、`bg-white`→bg-surface、`border-black`→border-ink、`text-black`→text-ink、`#FF5A00`（含 te.tsx ORANGE 常量、内联 style、Led 默认色、图表填充）→accent token/变量。hover/focus 变体（hover:bg-black、hover:text-white、focus:bg-white、bg-black 步骤条/按钮实底）按语义映射为 ink/surface 对应态。浅色态逐像素不变。

**Blocked by:** 01

**Status:** resolved

- [x] src 下无 bg-[#E4E3E0]/bg-white/border-black/text-black 残留（白名单注释除外）
- [x] ORANGE 常量与内联 style 中的 #FF5A00 收敛
- [x] 深色态下步骤条/实底按钮/选中态可读（ink↔surface 反转成立）
- [x] 浅色态截图对比无差异

## Answer

315 处主结构色 codemod 完成：bg-[#E4E3E0]→bg-base、bg-white/focus:bg-white→bg-surface、border-black→border-ink、text-black/text-[#111]→text-ink、bg-black→bg-ink（scrim bg-black/40 保留字面）、bg-[#FF5A00]→bg-accent、#FF6B00 系→accent-hover 新 token（#FF6B00/#FF7A26）。成对语义优先：bg-black text-white→bg-ink text-surface；33 个实底按钮 hover:bg-neutral-800→ink-hover 新 token（#262626/#CBC9C4）；红/橙底上的 text-white 保留字面（dark 下不可反）。ORANGE 常量与内联 #FF5A00/#FF6B00 收为 var(--accent)/var(--accent-hover)。194 测试全绿，lint 基线；双态截图核对：浅色逐像素一致（#E4E3E0/白面板/黑描边），深色 base #1C1B1A、surface #262522、ink #E8E7E4、选中态反转成立。
