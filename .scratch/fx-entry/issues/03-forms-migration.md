# 03 — 13 个涉钱表单迁移

**What to build:** 全站涉钱表单迁移到 MoneyFields + resolveMoney：订阅新建向导（标准价升级为 listPrice/listCurrency/listPriceBase 三字段；首笔付费获得折算框与预填）、订阅编辑表单（同款三字段，action 补 listPrice 写入）、付费记录三处（详情页新增、管理页新增/编辑、历史面板编辑——历史面板由此获得预填）、物品新建/编辑、联合会员向导（打包实付补折算框与预填）、追加费用面板、收益两处（快捷与管理页）。各 action 的 `?? amount` 静默 1:1 兜底全部删除，统一走 resolveMoney；无汇率拒绝映射为 `?error=fx`，各页补对应横幅文案。

**Blocked by:** 01, 02

**Status:** ready-for-agent

- [ ] 13 个表单全部走 MoneyFields，无自写金额三件套残留
- [ ] 订阅向导标准价三字段；确认页摘要显示原币+币种
- [ ] 订阅更新 action 写入 listPrice
- [ ] 所有 action 无 `?? amount` 静默兜底；resolveMoney 拒绝 → `?error=fx` 横幅
- [ ] 金额未知（ticket 12）在付费记录表单与 action 语义不变
- [ ] 冒烟：向导新建外币订阅全流程（标准价+首笔预填、无汇率拒绝、手填优先）
