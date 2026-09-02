# 04 — 计数型价值未知态（无单价先记次数，二期）

Type: task

**What to build:** 计数型订阅允许无替代单价运行：先记次数、单价后补。① 写路径守卫放宽：COUNT 的 DELTA 记录允许 `unitPrice` 与订阅 `altUnitPrice` 同时为空（现状继承链末端为空时的行为改为放行而非拦截——实施时先核对现状守卫）。② verdict 契约：`rollingVerdict` 与 `streamVerdict` 的 COUNT 变体在窗口内全部记录无单价时输出 `valueUnknown` 态（仿 `costUnknown` 先例）：净盈亏不出数字，headline 灰显「价值未知」，次数与成本照常显示；部分记录有单价时按有单价部分估值并标注口径。③ UI：录入台 / 详情页 / 红黑榜三处灰显分支；向导参数步替代单价标注「可先留空，盈亏显示价值未知」。④ 配置面允许保存空替代单价。

**Blocked by:** 01, 02

**Status:** ready-for-agent（二期，01/02 resolved 后开工）

- [ ] COUNT 无单价记录可落库，守卫放宽有测试
- [ ] rollingVerdict / streamVerdict 输出 valueUnknown，净盈亏不出数
- [ ] 三处 UI 灰显「价值未知」，次数与成本照常
- [ ] 部分记录有单价时的估值口径与标注
- [ ] 向导与配置面允许空替代单价
- [ ] 测试：全无单价 / 部分有单价 / 后补单价后 verdict 转正常
