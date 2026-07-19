# 用量脚本与任务调度 — Spec

## Problem Statement

额度型订阅（机场流量、网盘容量、coding plan 点数）的用量目前只能手动录入快照，而这类产品的用量数据都在其官网/API 上可查，手动抄数既繁琐又会忘——忘记录入时盈亏面板失真。同时，系统的周期任务（提醒扫描、汇率刷新）跑在早期"每小时手动 tick + 内存态日期比对"的临时调度器上，只支持日级节拍，且任务运行情况（跑没跑、成功没、耗时多少）完全不可见。

## Solution

用户（经 ADMIN 标记的信任用户）可为额度型订阅编写一段 JS 脚本，系统按 cron 表达式定时在沙箱中执行：脚本从外部 API 拉取当前已用量，返回 `{used, total?}`，系统自动写入用量快照。所有周期任务（提醒扫描、汇率刷新、用量脚本）统一由进程内 cron 注册表调度，每次运行落运行记录，并在任务大盘页集中展示每个任务的 cron、下次运行、上次耗时与成败、日志摘要，附配置页快捷跳转与"立即运行"调试按钮。

## User Stories

1. As a 信任用户, I want 为额度型订阅编写拉数脚本, so that 用量快照自动更新、盈亏面板始终为真
2. As a 信任用户, I want 用 cron 表达式配置执行频率（附每小时/每 6 小时/每天档位预填）, so that 不写语法也能配、要精细时也能配
3. As a 信任用户, I want 脚本能拿到我存的 API 密钥（env 注入、列表不回显）, so that 不用把 token 硬编码进脚本源码
4. As a 信任用户, I want 脚本里能用受限 fetch（超时、大小、次数熔断）, so that 能调外部 API 而不用担心脚本把自己玩死
5. As a 信任用户, I want 脚本报错时看到错误与 console 日志, so that 能调试
6. As a 信任用户, I want "立即运行"按钮, so that 写完脚本当场验证而不是等下个触发点
7. As an ADMIN, I want 在用户管理中逐人勾选脚本权限, so that 不受信任的用户碰不到沙箱
8. As a 用户, I want 在订阅详情用量面板看到脚本状态与跳转入口, so that 知道这个订阅的用量是自动同步的
9. As an ADMIN, I want 任务大盘看到所有周期任务的运行状态/耗时/日志/下次运行, so that 系统自动化对我是透明的、出问题能发现
10. As an ADMIN, I want 服务器重启后系统任务（提醒/汇率）自动补跑当日, so that 半夜宕机不漏提醒
11. As a 用户, I want 脚本失败时保留旧快照、等下个触发点自愈, so that 一次 API 抖动不污染数据
12. As an ADMIN, I want 外部 cron 可打 /api/cron/* 作为高频触发逃生门, so that 需要分钟级频率时不必改默认架构

## Implementation Decisions

- **单实例部署约定**（ADR-0005）：进程内调度、node:vm、SQLite 的前提。
- **调度注册表**（ADR-0006）：croner 进程内调度，任务 = { jobKey, cron 表达式, handler }；系统任务 `reminders`/`rates` 每日，用户脚本 `script:<订阅id>` 按各自 cron。croner protect 防重入。
- **运行记录 JobRun**：jobKey、startedAt、durationMs、OK/FAIL、message（摘要/日志截断）；每 job 保留最近 50 条；任务大盘数据源。启动时系统任务按"今天无 JobRun"补跑；脚本不补。
- **沙箱**（ADR-0007）：node:vm 执行；暴露受限 fetch（10s 超时、1MB 截断、每次运行限 5 次）、console（收日志）、env（脚本级 JSON，脱敏回显）；无 require/process/Buffer；vm timeout 熔断。返回值 `{used, total?}`，兼容裸数字（视为 `{used}`）；`total` 存在时覆盖快照的 quotaTotal。
- **订阅扩展**：script（源码）、scriptCron（表达式）、scriptEnv（JSON 密钥）三字段；script 为空即未启用。仅额度型订阅可启用。
- **信任标记**：User.canUseScripts，ADMIN 在用户管理勾选；脚本编辑/运行 action 与页面入口双层校验。
- **UI**：/settings/scripts 集中管理（订阅选择、源码编辑、cron 输入+档位预填+即时校验、env 编辑、立即运行、最近状态）；/settings/jobs 任务大盘；订阅详情用量面板显示脚本状态与跳转链接。
- **外部 cron**：/api/cron/scripts 新增（Bearer CRON_SECRET，跑 due 脚本）；现有 /api/cron/reminders 保持（提醒+汇率）。
- 旧临时调度器（reminders-scheduler）删除，语义迁入注册表。
- 脚本失败不重试（快照幂等，下个触发点自愈）。

## Testing Decisions

好测试：只测外部可观察行为（返回值、库表、快照），不测内部实现；注入替身隔离网络。

- **沙箱执行器（纯函数缝）**：`runScript(code, {env, fetcher})` 注入假 fetcher——正常返回/裸数字兼容/total 覆盖、无 require/process、超时熔断、fetch 次数与大小上限、console 日志收集、异常与超时落 error。
- **调度注册表（仓储缝）**：独立测试 SQLite——due 判定、JobRun 落库与 50 条裁剪、系统任务启动补跑语义、脚本产出写 UsageRecord（TOTAL 快照）。
- 先例：cost-engine 纯函数测试、reminders/exchange 仓储缝测试、croner 库本身不测。

## Out of Scope

- 计数型（COUNT）订阅的脚本支持
- 脚本市场/模板库、脚本间共享代码
- 失败重试与告警通知（失败仅在大盘与订阅详情可见）
- 强隔离沙箱（独立进程/容器/wasm）——信任模型下不需要（ADR-0007）
- 分钟级内置调度节拍（外部 cron 逃生门覆盖）

## Further Notes

旧 ticket（subtrace-v1 10-usage-scripts）由本 spec 取代；调度器重构是它的前置。依赖：croner（新增）、cron 表达式校验由 croner 解析能力复用。
