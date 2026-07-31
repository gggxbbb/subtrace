# 01 — 省钱型核心链路

**What to build:** 折扣类会员（京东 Plus、88VIP、盒马 X）的用量追踪闭环。用户可在用量向导把订阅设为「省钱型」（第三张卡：定义 + 适用例子，无单位/替代单价/总额度字段）；详情页用量录入卡提供两种姿势——「本次已省」增量录入，或「平台累计已省」照抄后自动与上一条求差存增量（卡片显示上一条累计值作参考；求差 ≤ 0 拒绝并提示改用增量录入，覆盖会员期重置场景）；用量记录页查看/编辑（日期/金额）/删除，金额列标签「已省金额」；盈亏面板省钱型分支显示 盈亏 = Σ已省 − 已摊成本 与回本差额（未回本"还差 ¥X 回本"/已回本"已净省 ¥X"），不显示每次实际成本，当前区间实时、历史区间可回看；受益用户各自录入自己的已省，所有者视角按受益人切片（成本 × 份额、只计本人记录）；dashboard 红黑榜把省钱型按盈亏纳入排序、亏损标红。脚本管理页仍只列额度型订阅（ADR-0011：省钱型不开放脚本）。

**Blocked by:** None — can start immediately

**Status:** resolved

- [x] 用量向导可将订阅设为省钱型（usageKind=SAVINGS；usageUnit/altUnitPrice/quotaTotal 置空；SQLite TEXT 列无需迁移）
- [x] 增量录入落库：kind=DELTA、source=MANUAL、quantity=已省金额（主币种），unitPrice/quotaTotal 置空
- [x] 累计录入自动与该订阅该用户最新一条省钱记录求差存增量，卡片显示上一条累计值
- [x] 求差 ≤ 0 时明确拒绝并提示改用增量录入（不静默产生负省钱）
- [x] 用量记录页查看/编辑（仅日期与金额）/删除省钱记录，金额列标签「已省金额」
- [x] 盈亏面板：盈亏 = Σ已省 − 已摊成本 + 回本差额；无每次实际成本；当前区间实时、历史区间可回看
- [x] 非省钱型订阅调省钱录入被拒绝；无权用户（非所有者非 USER 受益人）被拒绝
- [x] 受益用户各自录入；所有者视角按人切片盈亏（复用 forUserId 机制）
- [x] Dashboard 红黑榜纳入省钱型，按盈亏排序、亏损标红
- [x] 引擎缝测试：省钱型盈亏与回本差额（未回本/已回本/零成本基）
- [x] 服务缝测试：守卫、增量落库、累计求差正确性、求差 ≤0 拒绝、判定装配（含切片、金额未知段标记）、红黑榜数据源
- [x] 浏览器冒烟：京东 Plus 设省钱型 → 增量录入 → 累计录入求差 → 盈亏/回本差额显示 → 红黑榜出现

## Answer

- **引擎缝**：`savingsVerdict(costShare, saved) = saved − costShare`（cost-engine，与 `verdict` 并列的稳定领域概念）；2 条用例（未回本/已回本/零成本基）。
- **服务缝**：`addSavings(actor, sub, user, {date, amount? , cumulative?})`——amount/cumulative 二选一（`savings_ambiguous`/`savings_required`）；cumulative 求差基准 = **该记录所在服务区间内、该用户的 DELTA 之和**（随会员期新区间自然归零，受益人互不相抵），diff 保留两位小数，`≤ 0` 抛 `savings_not_increased`。`SavingsVerdict` 变体（cost/saved/verdictAmount/costUnknown），`getUsageVerdict` 省钱型分支只按 DELTA 求和（不受历史 TOTAL 快照污染）；受益人切片复用 forUserId。11 条新用例。
- **UI**：向导第三张卡（概念页同步三卡，省钱型无字段步骤、确认行只显类型）；录入卡省钱型分支（本次已省 / 平台累计已省双输入，显示本区间已记基准与回本提示）；盈亏面板三分支（已省金额 + 盈亏 + 回本差额，隐藏每次成本，footer「已省 X − 成本 Y」）；记录页金额列 ¥ 标签、编辑隐藏单价/总额度、隐藏类型过滤；红黑榜 detail 三分支。`UsageEntryPanel`/`UsageRecordsManager` 新增 currency prop。
- **脚本准入零改动**：`listScriptSubscriptions` 按 `usageKind: "QUOTA"` 过滤 + `quota_only` 守卫，省钱型天然排除。
- **坑**：冒烟驱动时 `input[name="amount"]` 与付费记录表单同名，`querySelector` 命中首个导致误建两笔付费记录（已删）——同名 input 多表单必须 `closest('form')` 作用域（workflow 既有坑位复现）。求差拒绝经 server action 抛错由 error boundary 浮现，无静默失败。
- 全套 219 测试绿，tsc 通过；浏览器冒烟全路径（向导→增量→累计求差→拒绝→编辑/删除→红黑榜）通过。
