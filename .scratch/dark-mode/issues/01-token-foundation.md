# 01 — token 地基与 class 策略

**What to build:** globals.css：定义 `:root`（浅色）与 `.dark`（深色）两套 CSS 变量（base/surface/ink/accent/muted/faint/line/band，浅色值 = 现行硬编码值，深色值 = spec 色板）；`@theme` 把它们映射为语义色（bg-base/bg-surface/text-ink/border-ink/border-line/text-muted/text-faint/bg-band 等）；删除模板残留的 prefers-color-scheme dark 块；body 背景/文字改用变量。根布局：html 加内联脚本（读 localStorage theme 偏好 + 系统媒体查询，首帧前设置/移除 dark class 防闪烁），html suppressHydrationWarning。

**Blocked by:** None

**Status:** ready-for-agent

- [ ] 8 个语义 token 双态定义，浅色值与现行 hex 逐字相等
- [ ] 模板残留 dark 媒体查询删除
- [ ] 内联防闪脚本：跟随/亮/暗三态解析正确
- [ ] 浅色态全站渲染与迁移前逐像素一致（无 token 使用时即应如此）
