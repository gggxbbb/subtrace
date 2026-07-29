# 03 — 灰阶与彩色 codemod

**What to build:** 按映射表迁移 Tailwind 灰阶：text-neutral-500→text-muted、text-neutral-400→text-faint、text-neutral-600/700→text-muted（逐案核对）、border-neutral-200/300→border-line、bg-neutral-100（含 /60）→bg-band、text-neutral-600 占位/说明文字按语义归 muted/faint。彩色：text-red-700→destructive token（深色调亮 #ef4444）、text-teal-700→income token（深色 #2dd4bf）。浅色态逐像素不变。

**Blocked by:** 01（可与 02 并行，注意同文件冲突）

**Status:** ready-for-agent

- [ ] neutral-* 使用点全部归入 5 个语义灰（映射表附在 Answer）
- [ ] red-700/teal-700 收敛为语义彩色 token
- [ ] 浅色态截图对比无差异；深色态次级文字对比度达标
