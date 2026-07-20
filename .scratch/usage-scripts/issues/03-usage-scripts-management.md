# 03 — 用量脚本管理

**What to build:** 额度型订阅可挂脚本：Subscription 增加 script/scriptCron/scriptEnv 字段；User 增加 canUseScripts（ADMIN 在用户管理勾选）；/settings/scripts 集中管理页（选择订阅、编辑源码/cron/env——env 脱敏回显留空不变、cron 档位预填与即时校验、立即运行、最近运行状态）；启用的脚本注册进调度注册表按 cron 执行，产出写 UsageRecord（TOTAL 快照，total 存在时覆盖额度）；运行记录并入 JobRun 与任务大盘；新增 /api/cron/scripts 外部触发入口；订阅详情用量面板显示脚本状态与跳转链接；非信任用户全程不可见不可用。

**Blocked by:** 01 调度器重构 + 任务大盘, 02 沙箱执行器

**Status:** claimed

- [ ] 信任用户在 /settings/scripts 可为额度型订阅增改删脚本与 cron、env（脱敏）
- [ ] cron 表达式非法时保存被拒并提示；档位预填可用
- [ ] 脚本按 cron 触发，产出写 TOTAL 快照（含 total 覆盖），JobRun 落记录
- [ ] 立即运行按钮当场执行并显示结果/日志
- [ ] 非信任用户看不到入口、action 层同样拒绝
- [ ] 订阅详情用量面板显示脚本状态与跳转链接
