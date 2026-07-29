# 04 — 「系统」设置页与三态切换

**What to build:** 新建 `/settings/system` 页：外观区放主题三态选择（亮 / 暗 / 跟随系统，当前态高亮，即点即切 + localStorage 持久化，与 01 的内联脚本共用存储键与解析逻辑）；Sidebar 设置组加入口（权限门控与其他设置页一致——普通用户可见）。页面结构与既有设置页同构（header + max-w-3xl 面板）。

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] /settings/system 渲染三态选择，切换即时生效并持久化
- [ ] 内联脚本与切换逻辑共用同一存储键/解析函数（无两份解析）
- [ ] Sidebar 设置组出现「系统」入口
- [ ] 刷新后选择保持；「跟随」时随系统切换
