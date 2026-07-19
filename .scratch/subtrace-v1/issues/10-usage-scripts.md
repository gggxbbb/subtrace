# 10 — 用量脚本沙箱

**What to build:** 用户可为订阅编写 JS 脚本定时调用产品 API 拉取当前周期用量并写入用量记录：node:vm 沙箱执行（受限 fetch、无 require、超时熔断）、cron 调度、最近运行状态可见。脚本功能仅对信任用户开放。

**Blocked by:** 06 用量与盈亏

**Status:** superseded

> 由 .scratch/usage-scripts/（spec + 3 tickets）取代：范围扩展为调度器重构（croner 注册表 + JobRun + 任务大盘）+ 沙箱执行器 + 脚本管理，设计见 ADR-0005/0006/0007。

- [ ] 订阅详情页可编辑脚本与 cron
- [ ] 沙箱内仅暴露受限 fetch，无 require/进程访问
- [ ] 超时熔断，异常写入 lastError 并展示
- [ ] 脚本产出写入用量记录（source=SCRIPT）
- [ ] 仅管理员标记的信任用户可使用脚本功能
