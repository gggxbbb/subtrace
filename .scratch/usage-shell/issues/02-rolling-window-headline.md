# 02 — 滑动窗判定 headline（红黑榜 + 详情页主数字）

Type: task

**What to build:** 用量盈亏对外判定切换为固定 30 天滑动窗（ADR-0014）。① 新纯函数 `rollingVerdict`（`src/lib/usage/`，与 `streamVerdict` 同级）：窗口 = [北京墙钟今天−30d, 今天)；净盈亏 = 窗口内用回价值 − `periodCost(窗口)`。COUNT = `usageValue(窗口)`；SAVINGS = Σ窗口内增量；QUOTA = 窗口内消耗 × 折算单价——消耗按相邻快照差归因（`heatmap.ts` 的差值逻辑抽为共享纯函数），折算单价 = 窗口与各用量周期重叠天数加权的（周期成本 ÷ 总额度）。STACKED 额外输出窗口内浪费事件（`projectPackLedger` 的 waste 按日期过滤）。订阅启用不足 30 天输出实际天数。受益人视角成本 × 份额沿用。② `dispatchVerdict` / `getUsageVerdict` 增 rolling 变体装配；周期 verdict 保留（历史回看与倒计时数据源），不删。③ UI：红黑榜行 headline 改「近30天」净盈亏（付了 X / 用回 Y / 净 Z），「本区间」措辞删除；行内次要信息加倒计时 chip（RESET 距重置 N 天 + 当前周期使用率；STACKED 下一到期 + 模拟余额）与窗口内浪费事件标注（「M月D日到期焚毁 N 单位」）；成本未知 / 快照陈旧灰显变色语义原样。详情页 `UsageVerdictPanel` 主数字切 rolling 口径，周期导航 + 历史回看保留原位。④ 窗口长度常量固定 30，不做配置入口。

**Blocked by:** 无（与 01 同触 `dashboard/page.tsx` 与 `getDashboardData`，建议先 01 后 02 或同人连续完成）

**Status:** resolved（review 后补：零日窗口零值判定 + 两处去重）

- [ ] rollingVerdict 三口径窗口净盈亏，复用 periodCost / usageValue / 快照差值
- [ ] QUOTA 跨用量周期重叠天数加权折算单价
- [ ] STACKED 窗口内浪费事件按日期过滤输出
- [ ] 启用不足 30 天输出实际天数并在 UI 标注（「近 12 天」）
- [ ] 红黑榜 headline「近30天」+ 倒计时 chip + 浪费事件标注；「本区间」措辞全站清除
- [ ] 详情页主判定同口径；历史逐周期回看保留
- [ ] 成本未知 / 快照陈旧语义回归不破坏
- [ ] 测试：rollingVerdict 缝（边界翻转、加权折算、不足 30 天、空记录）+ dispatchVerdict rolling 装配（受益人份额）
- [ ] 冒烟：红黑榜与详情页数字一致；录一笔后 headline 变化
