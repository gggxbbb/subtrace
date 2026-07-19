# 01 — 调度器重构 + 任务大盘

**What to build:** 进程内 croner 调度注册表接管全部周期任务：提醒扫描与汇率刷新从临时调度器（每小时手动 tick + 内存态）迁入，各自以 cron 表达式注册；每次运行落 JobRun（jobKey、起止、耗时、成败、消息），每 job 留最近 50 条；服务器启动时系统任务当日无记录则补跑一次；新增 /settings/jobs 任务大盘页（每个任务的 cron、下次运行、上次状态/耗时/消息、立即运行按钮、配置页跳转链接），侧边栏加入口；旧 reminders-scheduler 删除。

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [ ] JobRun 表落库并保留每 job 最近 50 条
- [ ] 提醒扫描、汇率刷新以 cron 注册进调度表，行为与之前一致
- [ ] 启动时系统任务当日未跑则补跑；脚本类任务不补
- [ ] /settings/jobs 展示所有任务的 cron/下次运行/上次状态耗时/消息 + 立即运行 + 配置页跳转
- [ ] 旧临时调度器删除，无重复调度
