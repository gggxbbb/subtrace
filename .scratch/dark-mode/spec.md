# 深色模式（dark-mode）

Status: ready-for-agent

2026-07-29 立项。五张 ticket，一票一 commit。

## 决策（grilling 已对齐）

- **模式策略**：默认跟随系统（prefers-color-scheme）；三态切换（亮 / 暗 / 跟随），持久化 localStorage；html `dark` class 策略 + 根布局内联脚本防首屏闪烁。切换入口放**新建「系统」设置页**（不放侧栏）。
- **token 架构**：`@theme` 语义 token（bg-base / bg-surface / border-ink / text-ink / accent 等）映射 CSS 变量，`dark` 类下变量翻转；现有硬编码 hex 经 codemod 机械迁移，此后新代码不写 hex。
- **灰阶**：一并 token 化为 5 个语义色——ink（主文字/描边）、muted（次级文字）、faint（装饰/占位）、line（细分隔线）、band（浅底带）。destructive/teal 深色调亮一档（red-700→#ef4444、teal-700→#2dd4bf）；LED 绿/红不变。
- **深色色板（暖黑镜像，与浅色同色相）**：base `#1C1B1A`、surface `#262522`、ink `#E8E7E4`、accent `#FF5A00` 不变、muted `#A3A09B`、faint `#83807A`（05 验收时自 #6E6B66 调亮：付费行元信息等装饰文字在深底过暗）、line `#3A3835`、band `#302E2B`。实施后浏览器预览微调。
- **顺手清理**：globals.css 里 create-next-app 模板残留的 dark 媒体查询（深色系统用户 overscroll 露黑缝）随 01 删除。

## 纯度约定

01–04 为架构迁移：浅色态渲染必须与现状逐像素一致（token 浅色值 = 现行硬编码值）；深色态为新增。05 是浅色不回归前提下的深色验收与微调。

## Out of Scope

- 任何布局/字号/间距变更。
- 深色专属的视觉 redesign（超出同色相翻转的部分），如有想法另立。
- 用户级（跨设备）主题同步——主题偏好存浏览器 localStorage。
