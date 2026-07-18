# 08 — 提醒渠道

**What to build:** 每日扫描任务：到期日 − remindDays 命中当天的订阅，经用户启用的渠道投递（Webhook POST / SMTP 邮件）；默认 7/3/0 天、每个订阅可改；设置页管理通知渠道；站内到期列表常显。

**Blocked by:** 03 订阅核心链路

**Status:** ready-for-agent

- [ ] 每个订阅可配置提醒天数（默认 7/3/0）
- [ ] 用户可添加 Webhook / 邮件渠道并启停
- [ ] 每日任务命中时向启用渠道投递，失败有记录
- [ ] 站内 dashboard 到期列表常显
