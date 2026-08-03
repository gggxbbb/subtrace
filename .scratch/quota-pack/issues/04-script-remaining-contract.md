# 04 — 用量脚本 `{ remaining }` 契约

**What to build:** 用量脚本在包叠加形态下的自动同步（ADR-0012）：`saveScript` 守卫从「仅额度型」放宽为额度型任意发放形态；STACKED 订阅的脚本返回 `{ remaining: number }` 即写一条 TOTAL 剩余快照（复用 STACKED 快照写入路径）；RESET 契约 `{ used, total? }` 完全不变；沙箱文档（返回值说明）按形态分裂同步。可演示：包叠加订阅挂一个返回 `{ remaining: 18 }` 的脚本，执行任务后剩余快照出现在记录页并参与推演（余额/浪费按新快照校准）。

**Blocked by:** 02 — 包叠加核心闭环（依赖 STACKED 快照写入路径与形态守卫；与 03 无依赖，可并行）

**Status:** resolved

- [x] 守卫放宽：QUOTA + RESET / STACKED 均可挂脚本；COUNT / SAVINGS 仍拒绝
- [x] STACKED 下脚本返回 `{ remaining }` 写 TOTAL 剩余快照（source=SCRIPT）；返回 `{ used }` 形态不匹配时给出明确报错
- [x] RESET 契约回归：现有 `{ used, total? }` 行为与测试不破坏
- [x] 沙箱文档/脚本编辑器提示按形态说明返回值
- [x] 服务缝测试：守卫放宽与拒绝面、`{ remaining }` 落库、RESET 回归

## Answer

**实现位置**：

- `src/lib/scripts/sandbox.ts`：`RunScriptOptions.contract`（`"used"` 默认 / `"remaining"`）驱动 `parseUsage` 按形态解析。remaining 契约只收 `{ remaining }`（非负有限数），裸数字与 `used` 均拒绝；used 契约新增「收到 remaining」的 mismatch 报错。两侧形态不匹配均报 `script_contract_mismatch`（中文说明 + 形态要求）。
- `src/lib/scripts/job.ts` `executeScriptJob`：按 `usageKind=QUOTA && grantMode=STACKED` 选契约；STACKED 走 `addQuotaSnapshot(owner, sub, owner, { date: today(), remaining, source: "SCRIPT" })` 复用 ticket 02 的快照写入路径；RESET 路径一字未动。摘要消息 STACKED 为「已写入剩余快照：剩余 N」。
- `src/lib/usage/service.ts` `addQuotaSnapshot`：入参加 `source?: string`（STACKED 分支落库，默认 MANUAL），供脚本标记 SCRIPT。
- `src/lib/scripts/service.ts`：`ScriptSubView` 增加 `grantMode`（编辑器按形态给提示用）。守卫本身不用改——原检查 `usageKind !== "QUOTA"` 天然放行任意 grantMode（grantMode 仅 QUOTA 可设），测试锁定该行为。
- 文案：`ScriptEditor.tsx` 脚本标签与默认模板按形态分裂（STACKED: `{remaining}` 剩余总量 / RESET: `{used, total?}` 已用量），订阅下拉项标「（包叠加）」；`docs/adr/0007` 返回值句改为按形态分裂；`CONTEXT.md` 用量脚本术语同步。

**关键决策**：形态校验放沙箱 `parseUsage`（由 job 传入 contract），沙箱不查库、保持纯执行器；STACKED 落库复用 `addQuotaSnapshot` 而非 job 内直写，守卫口径单一。STACKED 明确拒绝裸数字（与 used 歧义），要求显式 `{ remaining }`。

**验证**：`src/lib/scripts/`（service+sandbox）+ `src/lib/usage/service.test.ts` 共 78 测试全绿（新增：STACKED 挂脚本放行 / SAVINGS 拒绝、`{remaining}` 落库 kind=TOTAL+source=SCRIPT+quotaTotal=null、双向 mismatch 不写快照、sandbox contract 单测）；`tsc --noEmit` 通过；浏览器过设置页确认 STACKED/RESET 订阅的标签与默认模板随形态切换。
