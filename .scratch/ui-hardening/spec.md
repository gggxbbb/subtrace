# UI 层收敛与修正（ui-hardening）

Status: ready-for-agent

2026-07-29 UI 层评审后续。八张单关注点 ticket，一票一 commit。

## 决策（grilling 已对齐）

- **切片**:8 票，每票单一关注点，任意一票可独立 revert / 独立验收。
- **纯度**：收敛类票（01/02/06/07/08）为纯重构——渲染结果逐像素不变，验收以截图对比为准；顺手发现的其他 UI 问题（间距、hover、措辞）只记录在本文件末尾，不动手。行为修复票（03/04/05）不受此限。
- **流程**：轻量落盘；每个 ticket 完成即 resolve + commit，全部完成后不推送，待用户验收。

## 问题清单（出处 = 本轮 UI 评审）

1. `inputCls`/`labelCls`/`btnCls` 在 ~15 个客户端组件逐字复制（fmtMoney 问题的样式版）。
2. 橙色错误横幅 ~8 处复制（fx 轮每处手写同一份 markup)。
3. 存量 3 个 lint error:BundleWizard 渲染期 `new Date()`(react-hooks/purity)、Sidebar/ViewSwitcher effect 内同步 setState——真实 React 违规。
4. dashboard 用量红黑榜 N+1（循环内 `await listUsage`)；多页面独立 await 串行。
5. 整页无 loading 态，force-dynamic 页面白屏等待。
6. 行渲染双份：PaymentHistory vs PaymentsManager;PurchaseIncomePanel vs IncomesManager（架构评审候选 4 剩余）。
7. 两个步进向导（订阅新建、用量跟踪）各写一套 step 骨架。
8. 删除确认两种模式并存：native `confirm()` vs 自绘两步按钮。

## Out of Scope

- 任何视觉设计变更（配色、字号、间距、布局）。
- 客户端「今天」时区问题（浏览器时区 vs 北京墙钟）：记录，不在本轮。
- label htmlFor/id 关联（a11y）：记录，不在本轮。
- 新功能。

## 顺手发现（仅记录，不动手）

- BundleWizard 的 today/nextYear 修 purity 时顺带改由 server 父页传入（北京墙钟，附带修正客户端时区 edge）——属 03 票范围，非顺手。
- dashboard `auto/manual`、状态 `OK` 等 TE 风格英文：用户已接受的美学，不动。
