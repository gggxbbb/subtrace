# 10 — 用量脚本沙箱

**What to build:** 用户可为订阅编写 JS 脚本定时调用产品 API 拉取当前周期用量并写入用量记录：node:vm 沙箱执行（受限 fetch、无 require、超时熔断）、cron 调度、最近运行状态可见。脚本功能仅对信任用户开放。

**Blocked by:** 06 用量与盈亏

**Status:** wontfix
> 2026-08-26 关闭：取代方 .scratch/usage-scripts/（spec + 3 tickets）已全部 resolved 并交付——调度器重构（croner 注册表 + JobRun + 任务大盘）+ 沙箱执行器 + 脚本管理，设计见 ADR-0005/0006/0007；本票验收项由取代方覆盖，不再单独跟踪。

- [ ] 订阅详情页可编辑脚本与 cron
- [ ] 沙箱内仅暴露受限 fetch，无 require/进程访问
- [ ] 超时熔断，异常写入 lastError 并展示
- [ ] 脚本产出写入用量记录（source=SCRIPT）
- [ ] 仅管理员标记的信任用户可使用脚本功能
