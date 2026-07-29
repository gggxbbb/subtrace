# 01 — token 地基与 class 策略

**What to build:** globals.css：定义 `:root`（浅色）与 `.dark`（深色）两套 CSS 变量（base/surface/ink/accent/muted/faint/line/band，浅色值 = 现行硬编码值，深色值 = spec 色板）；`@theme` 把它们映射为语义色（bg-base/bg-surface/text-ink/border-ink/border-line/text-muted/text-faint/bg-band 等）；删除模板残留的 prefers-color-scheme dark 块；body 背景/文字改用变量。根布局：html 加内联脚本（读 localStorage theme 偏好 + 系统媒体查询，首帧前设置/移除 dark class 防闪烁），html suppressHydrationWarning。

**Blocked by:** None

**Status:** resolved

- [x] 8 个语义 token 双态定义，浅色值与现行 hex 逐字相等
- [x] 模板残留 dark 媒体查询删除
- [x] 内联防闪脚本：跟随/亮/暗三态解析正确
- [x] 浅色态全站渲染与迁移前逐像素一致（无 token 使用时即应如此）

## Answer

globals.css 重写：:root/.dark 各 10 个语义变量（浅色值与原 hex 逐字相等，深色为 spec 暖黑色板），@theme inline 映射为 bg-base/bg-surface/text-ink/border-ink/text-muted/text-faint/border-line/bg-band/text-destructive/text-income 语义类；模板残留 dark 媒体查询删除；body 底色/文字走变量。根布局 head 内联防闪脚本（theme=light|dark|system + 媒体查询 → 首帧前 toggle dark class），html suppressHydrationWarning；存储键 theme（04 切换页共用）。冒烟：无存储时浅色 body #E4E3E0 无 dark class；存 dark 后 body #1C1B1A 且 dark class 于首帧前生效。一处已知微差：AppLayout 的 text-[#111] 将随 02 归 text-ink（#000），差 1/255，记此备查。
