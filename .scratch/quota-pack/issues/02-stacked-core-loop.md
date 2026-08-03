# 02 — 包叠加核心闭环：手动包 + 快照 + 浪费 verdict + 最小 UI

**What to build:** 包叠加形态的最小可用闭环（手动模式即可演示）：schema 增加 `grantMode`（空即 RESET，存量零迁移）、`packValidMonths` 与 `QuotaPack` 表（下发日/数量/到期日/来源，级联删除）；用量向导在额度型后增加发放形态选择（周期重置/包叠加）与 STACKED 字段（每周期下发量复用总额度字段、有效期月数），形态切换沿用类型切换警告（警告不禁止）；手动包增删改（AUTO 包只读，本票尚无 AUTO）；STACKED 快照录入只收「剩余总量」（拒绝 DELTA 与百分比入参），记录页 STACKED 下列标签为「剩余」且无增量录入入口；`getUsageVerdict` 装配 PackVerdict——浪费导向（verdictAmount = −本区间确认浪费），携带余额+快照日期+陈旧天数（≥30 天变色）、到期预警、区间/累计浪费、costUnknown 透传；池级口径（受益人只切成本份额，用量/浪费不按人切）；盈亏卡与 dashboard 红黑榜按 verdictAmount 纳入现有排序。可演示：手动模式订阅设包叠加 → 手动加包 → 录两条剩余快照 → 看到余额、到期预警、浪费金额、红黑榜上榜。

**Blocked by:** 01 — FEFO 推演引擎（verdict 装配依赖 `projectPackLedger`）

**Status:** resolved

- [x] schema 迁移落库：grantMode / packValidMonths / QuotaPack；存量 QUOTA 订阅行为不变（空即 RESET）
- [x] 服务缝测试（prisma 测试库）：手动包 CRUD 守卫；STACKED 快照录入（remaining 落库、DELTA/百分比拒绝）；PackVerdict 装配（浪费金额、池级忽略 forUserId 用量切片、成本仍乘份额、costUnknown）
- [x] 向导：形态选择 + STACKED 字段 + 切换警告；录入卡/盈亏卡/记录页 STACKED 分支；包管理卡（手动包增删改、AUTO 只读列表位）
- [x] 陈旧度提示（≥30 天变色）在详情页与大盘原位展示，无推送
- [x] 冒烟：dev server 浏览器走「设包叠加 → 手动加包 → 录快照 → 浪费/预警显示 → 红黑榜」

## Answer

**实现位置**：
- schema：`prisma/schema.prisma`（`Subscription.grantMode`/`packValidMonths` + 新表 `QuotaPack`，级联删除），迁移 `20260803030544_quota_packs`。
- 服务缝：`src/lib/usage/service.ts`——`setUsageConfig` 扩展形态字段（手动模式 + STACKED 清空 quotaTotal/packValidMonths）；`addQuotaSnapshot` STACKED 分支（remaining → TOTAL，拒 used/percent；RESET 拒 remaining）；`addUsage` 拒 STACKED；手动包 CRUD（`addPack`/`updatePack`/`deletePack`/`listPacks`，所有者限定、AUTO 行不可手触）；`packVerdict` 装配（浪费导向）。测试 `service.test.ts` 新增 16 例（全套 39 例绿，相关 8 文件 155 例绿 + tsc 净）。
- UI：向导 `UsageWizard.tsx`（额度型插入「形态」步，周期重置/包叠加 + 适用场景；STACKED 字段 = 每周期下发量（复用 quotaTotal）+ 有效期月数；手动模式显示改用周期模式引导；形态切换警告与类型切换同款）；录入卡/盈亏卡 `UsagePanel.tsx`（STACKED 单字段剩余 + 上一条参考；PackVerdict 分支：余额+快照日期+陈旧天数（≥30 变红）、到期预警、区间/累计浪费，隐藏使用率/用满）；记录页 `UsageRecordsManager.tsx`（STACKED 列标签「剩余」、无增量入口、隐藏类型筛选与单价/总额度编辑）；包管理卡 `PacksPanel.tsx`（手动增删改 + AUTO 只读列表位）；dashboard `src/lib/dashboard.ts` 红黑榜 detail 加 PACK 分支，排序沿用 verdictAmount。

**关键决策**：
- **停订即焚合成快照**（ticket 01 留下的决策点）：`packVerdict` 在 `currentExpiry < today` 时向引擎追加一条 `{date: expiry, remaining: 0}` 快照——引擎窗口推进到到期日先把存活包按截断后的有效到期日焚毁（计浪费）再校准，全量浪费无需用户操作即显形。
- **已到期订阅的 verdict 区间**：既有 `getUsageVerdict` 无覆盖段即返回 null；STACKED 例外——回落到最后一个成本段归因（否则停订浪费永不可见），该段浪费归因含右端点（终止日焚毁确认在段末排他端点上）。
- **单张成本**（spec 只定义了 AUTO 口径，手动模式是空白）：段净额 ÷ 该段应发量；段内有 AUTO 包时应发量 = Σ AUTO 数量且 MANUAL 为零成本赠送包（不摊薄，ADR-0012）；段内无 AUTO（手动模式）时 MANUAL 即付费额度，应发量 = Σ MANUAL 数量。ticket 03 的 AUTO 生成器落地后此口径天然衔接。
- **池级**：快照/包/浪费全部忽略 forUserId 切片（共享池按人各记一遍即双倍计数）；forUserId 只影响 `cost` 字段（× 份额），verdictAmount = −本区间浪费金额对所有受益人一致。
- **无快照也返回 PackVerdict**（balance 0 / balanceAt null / 浪费 0），让盈亏卡能显示成本与「未录入快照」态，而不是「无覆盖区间」空卡。
- PackVerdict 作为 `UsageVerdict` 联合的第 4 个变体 `kind: "PACK"`（不是 QUOTA 子标志）——UI 分支干净利落，RESET 的 QuotaVerdict 一字未动。

**坑**：
- `prisma migrate dev` 后客户端生成偶发滞后（`Unknown argument grantMode`）：显式 `pnpm prisma generate` + `hub restart web` 后正常——老坑的又一例。
- `getUsageVerdict` 顶部「无覆盖段 return null」会截死已到期订阅的停订浪费：STACKED 分支必须移到该判断之前。
- 向导步骤数按类型动态（额度型 5 步）：渲染条件从 `step === N` 改成按步名（`cur === "形态"`），否则插一步全错位。
- 冒烟夹具订阅/付费记录用 better-sqlite3 直写 dev 库（generated client 是 TS，无 tsx）；date 输入 native setter + input 事件驱动，同名 input 用 `closest('form')` 作用域。

**冒烟观察**（gggxbbb，手动模式像素蛋糕年付 ¥100 + A 包 7/1 发 30 张 8/1 到期 + B 包 7/15 发 30 张次年 1/15 到期）：向导「形态」步两卡渲染正常 → 包叠加保存后详情页出现剩余录入卡 + 包管理卡（AUTO 位「无 — 手动模式不生成」）→ 录 7/20 余 60（余额 60、预警 8/1 到期 30 张）→ 录 8/2 余 25（A 焚 30 张 × 单张 100/60，本区间浪费 −¥50.00、余额 25、预警 B 包 2027-01-15 预计剩 25、推算消费 5 张）→ 临时单条 6/15 快照验证「陈旧 49 天，该校准了」红色分支（text-destructive）→ 记录页「剩余 25/60 张」无增量入口 → dashboard 红黑榜出现「像素蛋糕（包叠加冒烟） 余额 25 张 · 区间浪费 50.00 −¥50.00」并参与既有排序。手动包增改、排他边界与停订即焚由服务缝测试锁定。

未 commit（主会话统一提交）。
