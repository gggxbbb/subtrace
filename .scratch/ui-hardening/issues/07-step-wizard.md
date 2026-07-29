# 07 — StepWizard 步进外壳

**What to build:** 抽取 StepWizard 外壳：步骤条（编号 + 当前/已完成态）、上一步/下一步导航、逐步校验回调（返回错误消息或 null）、确认步摘要插槽。迁移订阅新建向导与用量跟踪向导（联合会员向导非步进式，不动）。纯重构。

**Blocked by:** None

**Status:** resolved

- [x] StepWizard 承载步骤条与导航/校验循环
- [x] 两个向导迁移后步骤行为与校验消息不变
- [x] 冒烟：订阅新建四步全流程 + 用量向导四步全流程

## Answer

`src/components/StepWizard.tsx`：StepBar（两向导逐字相同的编号步骤条）+ useStepWizard（step/stepError/next/back 状态机，validate 返回错误消息或 null，onAdvance 前进前回调）。订阅向导：校验与摘要采集迁入闭包；用量向导：仅换 StepBar（其导航/提交形态与订阅差异大——按设计保留本地）。**冒烟抓到并修复一个 e79d0cc 引入的真 bug**：createSubscriptionAction 的成功 redirect 残留 try 块内被 catch 吞掉（NEXT_REDIRECT → error=1，订阅与首笔实际已落库）——已移出 try，创建全流程恢复。194 测试全绿；订阅四步（空名校验 → 周期校验 → 摘要 → 创建落地详情页）与用量四步冒烟通过；冒烟数据已清理。
