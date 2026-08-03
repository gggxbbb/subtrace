# 02 — 包叠加核心闭环：手动包 + 快照 + 浪费 verdict + 最小 UI

**What to build:** 包叠加形态的最小可用闭环（手动模式即可演示）：schema 增加 `grantMode`（空即 RESET，存量零迁移）、`packValidMonths` 与 `QuotaPack` 表（下发日/数量/到期日/来源，级联删除）；用量向导在额度型后增加发放形态选择（周期重置/包叠加）与 STACKED 字段（每周期下发量复用总额度字段、有效期月数），形态切换沿用类型切换警告（警告不禁止）；手动包增删改（AUTO 包只读，本票尚无 AUTO）；STACKED 快照录入只收「剩余总量」（拒绝 DELTA 与百分比入参），记录页 STACKED 下列标签为「剩余」且无增量录入入口；`getUsageVerdict` 装配 PackVerdict——浪费导向（verdictAmount = −本区间确认浪费），携带余额+快照日期+陈旧天数（≥30 天变色）、到期预警、区间/累计浪费、costUnknown 透传；池级口径（受益人只切成本份额，用量/浪费不按人切）；盈亏卡与 dashboard 红黑榜按 verdictAmount 纳入现有排序。可演示：手动模式订阅设包叠加 → 手动加包 → 录两条剩余快照 → 看到余额、到期预警、浪费金额、红黑榜上榜。

**Blocked by:** 01 — FEFO 推演引擎（verdict 装配依赖 `projectPackLedger`）

**Status:** ready-for-agent

- [ ] schema 迁移落库：grantMode / packValidMonths / QuotaPack；存量 QUOTA 订阅行为不变（空即 RESET）
- [ ] 服务缝测试（prisma 测试库）：手动包 CRUD 守卫；STACKED 快照录入（remaining 落库、DELTA/百分比拒绝）；PackVerdict 装配（浪费金额、池级忽略 forUserId 用量切片、成本仍乘份额、costUnknown）
- [ ] 向导：形态选择 + STACKED 字段 + 切换警告；录入卡/盈亏卡/记录页 STACKED 分支；包管理卡（手动包增删改、AUTO 只读列表位）
- [ ] 陈旧度提示（≥30 天变色）在详情页与大盘原位展示，无推送
- [ ] 冒烟：dev server 浏览器走「设包叠加 → 手动加包 → 录快照 → 浪费/预警显示 → 红黑榜」
