# 04 — 取数并行化（N+1 消除）

**What to build:** dashboard 用量红黑榜的循环 `await listUsage` 改 Promise.all 并行；页面层独立 await 改并行：purchases/[id]（份额行/收益/事件）、bundles/page（列表/归档）、incomes/page、其余页面内互相独立的取数。结果数字不变。

**Blocked by:** None

**Status:** ready-for-agent

- [ ] dashboard usageBoard 无循环串行 await
- [ ] 独立取数全部 Promise.all（不改变依赖顺序）
- [ ] 全套件绿；dashboard/物品详情/联合会员页数字不变
