# 08 — 提醒渠道

**What to build:** 每日扫描任务：到期日 − remindDays 命中当天的订阅，经用户启用的渠道投递（Webhook POST / SMTP 邮件）；默认 7/3/0 天、每个订阅可改；设置页管理通知渠道；站内到期列表常显。

**Blocked by:** 03 订阅核心链路

**Status:** resolved

## Answer

remindDays（JSON 数组，默认 [7,3,0]）在订阅新建/编辑表单可配；NotificationChannel（WEBHOOK={url} | EMAIL={host,port,secure,user,pass,from,to}）在 /settings/channels 增删启停 + 试发；POST /api/cron/reminders（Bearer CRON_SECRET）每日扫描「currentExpiry − remindDays = 今天」的 ACTIVE 订阅，向启用渠道投递，ReminderDelivery 按 (渠道,订阅,到期日,偏移) 唯一键去重并记录 OK/FAIL+error；站内到期列表沿用 dashboard「即将到期」面板。

- [x] 每个订阅可配置提醒天数（默认 7/3/0）
- [x] 用户可添加 Webhook / 邮件渠道并启停
- [x] 每日任务命中时向启用渠道投递，失败有记录
- [x] 站内 dashboard 到期列表常显
