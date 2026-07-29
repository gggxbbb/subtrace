# 03 — 13 个涉钱表单迁移

**What to build:** 全站涉钱表单迁移到 MoneyFields + resolveMoney：订阅新建向导（标准价升级为 listPrice/listCurrency/listPriceBase 三字段；首笔付费获得折算框与预填）、订阅编辑表单（同款三字段，action 补 listPrice 写入）、付费记录三处（详情页新增、管理页新增/编辑、历史面板编辑——历史面板由此获得预填）、物品新建/编辑、联合会员向导（打包实付补折算框与预填）、追加费用面板、收益两处（快捷与管理页）。各 action 的 `?? amount` 静默 1:1 兜底全部删除，统一走 resolveMoney；无汇率拒绝映射为 `?error=fx`，各页补对应横幅文案。

**Blocked by:** 01, 02

**Status:** resolved

- [x] 13 个表单全部走 MoneyFields，无自写金额三件套残留
- [x] 订阅向导标准价三字段；确认页摘要显示原币+币种
- [x] 订阅更新 action 写入 listPrice
- [x] 所有 action 无 `?? amount` 静默兜底；resolveMoney 拒绝 → `?error=fx` 横幅
- [x] 金额未知（ticket 12）在付费记录表单与 action 语义不变
- [x] 冒烟：向导新建外币订阅全流程（标准价+首笔预填、无汇率拒绝、手填优先）

## Answer

8 个未接线表单全部迁入 MoneyFields：订阅向导（标准价三字段 names=list*、首笔付费 prefix=first + requiredAmount=false）、订阅编辑表单（initial 补 listPrice，编辑页补 error 横幅）、联合会员向导（打包实付 names=total*，onAmountChange 驱动实时分摊）、追加费用面板与收益两处（inline 布局三件套）、PaymentHistory 编辑表单（由此获得预填）。action 层：subscriptions/purchases/bundles 全部改走 resolveMoney（付费记录 allowUnknown 保 ticket 12；手动模式不解析标准价字段），静默 1:1 兜底全删，NoRateError 映射 ?error=fx、其余 ?error=1（redirect 均在 catch 内抛出，未吞 NEXT_REDIRECT）；updateSubscription 起写入 listPrice；MoneyFields 增补 requiredAmount/onAmountChange props。186 测试全绿，tsc 无错误。冒烟：向导 USD 15.99 无汇率 → error=fx 横幅文案正确；配 7.2 汇率后预填 115.13、手填不被覆盖、清空重填；提交落地付费历史快照 ¥115.13（首笔留空=同标准价）。dev 库留有一条「FX 冒烟测试」订阅与 USD 7.2 汇率（验收后可删）。
