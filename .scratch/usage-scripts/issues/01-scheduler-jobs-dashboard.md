# 01 — 调度器重构 + 任务大盘

**What to build:** 进程内 croner 调度注册表接管全部周期任务：提醒扫描与汇率刷新从临时调度器（每小时手动 tick + 内存态）迁入，各自以 cron 表达式注册；每次运行落 JobRun（jobKey、起止、耗时、成败、消息），每 job 留最近 50 条；服务器启动时系统任务当日无记录则补跑一次；新增 /settings/jobs 任务大盘页（每个任务的 cron、下次运行、上次状态/耗时/消息、立即运行按钮、配置页跳转链接），侧边栏加入口；旧 reminders-scheduler 删除。

**Blocked by:** None — can start immediately

**Status:** resolved

## Answer

JobRun 表（jobKey+startedAt 索引）落库、runJob 统一计时/成败/摘要/50 条裁剪；reminders（0 0 * * *）与 rates（5 0 * * *）经 croner 注册（UTC、protect 防重入），失败 60 分钟后重试一次（保留旧调度器的小时重试语义）；启动时 catchUp 任务当日无 OK 记录即补跑，脚本类不补。/settings/jobs 大盘：cron/下次运行/上次状态耗时/消息/立即运行/配置页跳转，侧边栏入口。旧 reminders-scheduler 删除；/api/cron/reminders 改走 runJob（记录同源）。实例无关设计：调度表仅在 instrumentation 实例，定义解析/runJob/listJobs 走静态定义+DB（dev 多模块实例下大盘可见）。

- [x] JobRun 表落库并保留每 job 最近 50 条
- [x] 提醒扫描、汇率刷新以 cron 注册进调度表，行为与之前一致
- [x] 启动时系统任务当日未跑则补跑；脚本类任务不补
- [x] /settings/jobs 展示所有任务的 cron/下次运行/上次状态耗时/消息 + 立即运行 + 配置页跳转
- [x] 旧临时调度器删除，无重复调度
