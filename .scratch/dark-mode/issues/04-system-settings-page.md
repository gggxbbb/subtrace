# 04 — 「系统」设置页与三态切换

**What to build:** 新建 `/settings/system` 页：外观区放主题三态选择（亮 / 暗 / 跟随系统，当前态高亮，即点即切 + localStorage 持久化，与 01 的内联脚本共用存储键与解析逻辑）；Sidebar 设置组加入口（权限门控与其他设置页一致——普通用户可见）。页面结构与既有设置页同构（header + max-w-3xl 面板）。

**Blocked by:** 01

**Status:** resolved

- [x] /settings/system 渲染三态选择，切换即时生效并持久化
- [x] 内联脚本与切换逻辑共用同一存储键/解析函数（无两份解析）
- [x] Sidebar 设置组出现「系统」入口
- [x] 刷新后选择保持；「跟随」时随系统切换

## Answer

`/settings/system` 页（server 骨架与既有设置页同构）+ ThemePanel（client）：三态分段控件（亮/暗/跟随系统），即点即切，localStorage theme 键与根布局内联脚本共用同一解析语义；挂载后同步存储偏好（SSR 统一按 system 首帧，避免水合不匹配，显式豁免注释）。Sidebar 设置组加「系统」入口（Monitor 图标，无权限门控）。冒烟：导航项存在；dark→亮（class 移除、存 light）→跟随系统（存 system）；跨页导航后选择保持。194 测试全绿，lint 基线。
