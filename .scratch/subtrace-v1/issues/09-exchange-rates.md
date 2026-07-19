# 09 — 汇率表与外币快照

**What to build:** 用户级主币种设置；汇率表维护（每币对自动 API 定时更新或手动钉住）；付费/物品录入外币时按汇率预填折算主币种金额、可手改，快照固化（ADR-0004）；自动更新失败保留上次值并标记。

**Blocked by:** 03 订阅核心链路

**Status:** resolved

## Answer

ExchangeRate（userId+currency 唯一，rateToBase，AUTO|MANUAL，lastError）+ User.ratesApiUrl（{base} 模板，默认 open.er-api.com）。/settings/rates 管理主币种/币对/API 模板，AUTO 每日刷新（内置调度器与 /api/cron/reminders 双路径都跑），失败保留旧值+红 Led 标记，可手动"立即刷新"。录入预填 attachRatePrefill（付费三表单+物品两表单经 PrefillForm）：失焦按汇率填折算值，不覆盖手改，无汇率清残值。快照语义（ADR-0004）引擎零改动。

- [x] 用户可设主币种
- [x] 汇率表支持自动（可配置 API 源、每日更新）与手动两种模式
- [x] 录入外币记录时预填折算值且可修改，保存后快照不再变
- [x] 改汇率不影响历史记录
- [x] 自动更新失败保留旧值并在设置页标记
