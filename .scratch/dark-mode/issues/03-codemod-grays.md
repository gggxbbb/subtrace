# 03 — 灰阶与彩色 codemod

**What to build:** 按映射表迁移 Tailwind 灰阶：text-neutral-500→text-muted、text-neutral-400→text-faint、text-neutral-600/700→text-muted（逐案核对）、border-neutral-200/300→border-line、bg-neutral-100（含 /60）→bg-band、text-neutral-600 占位/说明文字按语义归 muted/faint。彩色：text-red-700→destructive token（深色调亮 #ef4444）、text-teal-700→income token（深色 #2dd4bf）。浅色态逐像素不变。

**Blocked by:** 01（可与 02 并行，注意同文件冲突）

**Status:** resolved

- [x] neutral-* 使用点全部归入 5 个语义灰（映射表附在 Answer）
- [x] red-700/teal-700 收敛为语义彩色 token
- [x] 浅色态截图对比无差异；深色态次级文字对比度达标

## Answer

映射表（浅色值与原值逐字相等）：text-neutral-500→text-muted(119)、text-neutral-400→text-faint(110)、border-neutral-200→border-line(28)、bg-neutral-100(/60)→bg-band(2)。为保逐像素新增三 token：muted-strong（neutral-600 #525252/#8F8B85，8 处；Sidebar 唯一一处 neutral-700 一并归入，浅色 #404040→#525252 微差记此）、line-strong（neutral-300 #D4D4D4/#4A4844，13 处含禁用点与日历 dim 日）、destructive-hover（red-800 #991b1b/#F87171，7 处）。彩色：red-700 系→destructive（32 处）、teal-700→income(8 处）；亮红 #ef4444 与 LED 绿/蓝保留字面（深底可读）。src 下 neutral-* 残留 0。194 测试全绿，lint 基线；双态 probe：浅 #737373/#A3A3A3/#E5E5E5 不变，深 #A3A09B/#6E6B66/#3A3835。
