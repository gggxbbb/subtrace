# 04 — 用量脚本 `{ remaining }` 契约

**What to build:** 用量脚本在包叠加形态下的自动同步（ADR-0012）：`saveScript` 守卫从「仅额度型」放宽为额度型任意发放形态；STACKED 订阅的脚本返回 `{ remaining: number }` 即写一条 TOTAL 剩余快照（复用 STACKED 快照写入路径）；RESET 契约 `{ used, total? }` 完全不变；沙箱文档（返回值说明）按形态分裂同步。可演示：包叠加订阅挂一个返回 `{ remaining: 18 }` 的脚本，执行任务后剩余快照出现在记录页并参与推演（余额/浪费按新快照校准）。

**Blocked by:** 02 — 包叠加核心闭环（依赖 STACKED 快照写入路径与形态守卫；与 03 无依赖，可并行）

**Status:** ready-for-agent

- [ ] 守卫放宽：QUOTA + RESET / STACKED 均可挂脚本；COUNT / SAVINGS 仍拒绝
- [ ] STACKED 下脚本返回 `{ remaining }` 写 TOTAL 剩余快照（source=SCRIPT）；返回 `{ used }` 形态不匹配时给出明确报错
- [ ] RESET 契约回归：现有 `{ used, total? }` 行为与测试不破坏
- [ ] 沙箱文档/脚本编辑器提示按形态说明返回值
- [ ] 服务缝测试：守卫放宽与拒绝面、`{ remaining }` 落库、RESET 回归
