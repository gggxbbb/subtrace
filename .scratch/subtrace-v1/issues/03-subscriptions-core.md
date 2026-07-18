# 03 — 订阅 + 付费记录核心链路

**What to build:** 双跟踪模式订阅 CRUD（周期模式：日历日/周/月/年或固定天数、标准价、锚定日期、自动续费标记、remindDays；手动模式：不维护周期）、付费记录录入（实付金额、支付日期、服务区间——周期模式按周期预填可改、来源 auto/manual/promo、退款金额、备注）、订阅列表与详情页（到期日、付费历史、状态 ACTIVE/CANCELLED/ARCHIVED）。Dashboard 用真实数据转正：当日总日均、本月支出、即将到期列表、30 天支出趋势（TE 风 UI 从 /prototype/dashboard 重写进正式路由，删除原型路由与 mock 数据）。

**Blocked by:** 01 成本引擎, 02 认证与邀请制

**Status:** resolved

- [x] 可创建周期模式与手动模式订阅
- [x] 记一笔付费后到期日按记录驱动规则更新（ADR-0001）
- [x] 周期模式录入付费时服务区间按周期预填且可修改
- [x] 退款金额使成本按净额计算
- [x] Dashboard 当日总日均与即将到期来自真实数据库（成本引擎计算）
- [x] TE 风 UI 落地正式路由，/prototype 路由与 mock 数据删除
- [x] 未登录访问被重定向

## Answer

Schema 扩展 Subscription/Payment 并迁移；订阅服务（仓储缝 8 条测试）；TE 组件库（te.tsx/Sidebar）转正；dashboard 数据装配 `src/lib/dashboard.ts`（总日均、即将到期、30 天趋势、本月/年支出）。
浏览器全链路冒烟：创建年付订阅 → 记活动价付费（370 天）→ 到期日顺延、费率下降、趋势屏呈现阶梯。
引擎修正两处真实数据暴露的问题（均补测试）：①首笔付费之前的未记账周期也要前向补齐（从起始日而非可能被改写的锚点）；②与首笔记录交叠的周期截断到记录起点并按天折算净额。
修复 server action 经典坑：`redirect()` 抛 NEXT_REDIRECT 不能放 try 内。
44 条测试全绿，tsc 通过。
