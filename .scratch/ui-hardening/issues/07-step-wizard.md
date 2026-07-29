# 07 — StepWizard 步进外壳

**What to build:** 抽取 StepWizard 外壳：步骤条（编号 + 当前/已完成态）、上一步/下一步导航、逐步校验回调（返回错误消息或 null）、确认步摘要插槽。迁移订阅新建向导与用量跟踪向导（联合会员向导非步进式，不动）。纯重构。

**Blocked by:** None

**Status:** ready-for-agent

- [ ] StepWizard 承载步骤条与导航/校验循环
- [ ] 两个向导迁移后步骤行为与校验消息不变
- [ ] 冒烟：订阅新建四步全流程 + 用量向导四步全流程
