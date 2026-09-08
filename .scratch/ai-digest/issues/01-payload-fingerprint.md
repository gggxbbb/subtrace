# 01 - 摘要载荷与指纹（纯函数）

Type: task

**What to build:** AI 摘要的信号载荷构造与指纹哈希，纯函数模块，Vitest 直测。spec: `.scratch/ai-digest/spec.md`，立场 ADR-0016。

**Blocked by:** —（无）

**Status:** resolved

- [x] `src/lib/digest/payload.ts`：`buildDigestPayload` 从 `DashboardData` 提取全部信号为可序列化 JSON——upcoming（名称/天数/金额/自动）、usageBoard（名称/verdictAmount/wasteNote/stale/countdown/windowLabel/quantityLabel/paid/value）、monthSpent/yearSpent、近 30 天 trend 聚合值（总额/均值，不塞 30 个原始点）、purchases（名称/daysHeld/progress）、主币种。展示态字段（trend 原始序列、entryRows、quickTuples 等录入台专用）不进载荷
- [x] `digestFingerprint(payload, userId)`：稳定序列化（对象键排序、日期 ISO、数字定点化）后 sha256 hex；指纹输入含 userId
- [x] 测试（Vitest 纯函数，无 DB）：同输入同指纹（键序无关）；任一信号值变化 → 指纹变；不同 userId 同数据 → 指纹不同；金额浮点（0.1+0.2 类）定点化后不抖

## Contract

**src/lib/digest/payload.ts**
- `buildDigestPayload(d: DashboardData): DigestPayload` — 纯函数，`DigestPayload` 为 JSON-safe 结构（无 Date 实例，日期一律 ISO 日串）
- `digestFingerprint(payload: DigestPayload, userId: string): string` — sha256 hex；同一 (payload, userId) 必得同值

## Comments

## Answer

实现位置：`src/lib/digest/payload.ts`（纯函数，零依赖除 `node:crypto` 与 `@/lib/dashboard` 类型）+ `src/lib/digest/payload.test.ts`（11 例全绿，`pnpm exec vitest run src/lib/digest/payload.test.ts`；`pnpm exec tsc --noEmit` 无新错误）。

关键决策：
- **主币种不塞载荷**：验收项提到的「主币种」在 `DashboardData` 里不存在（指派明确：别去查库），载荷只含 DashboardData 已有信号；将来要加币种需先成为引擎/装配层信号（ADR-0016「信号面是能力上限」）。
- **可选字段显式归一**：usageBoard 的 `wasteNote/stale/countdown/costUnknown/valueUnknown` 与 purchases 的 `progress` 在源类型里是可选/undefined，载荷统一落成 `null`/`false`，保证「字段缺省」与「字段为 falsy」序列化一致，指纹不抖。
- **稳定序列化**：递归键排序 + `JSON.stringify`；数字一律 `Number(n.toFixed(4))` 定点化（0.1+0.2 与 0.3 收敛同值；非有限数归 null）。指纹输入为 `{ payload, userId }` 整体稳定序列化后的 sha256 hex。
- **trend 只聚合**：`{ total, average }`，空数组双 0；原始 30 点与 rows/entryRows/usageById/KPI 展示字段不进载荷（有测试断言展示字段变化不影响指纹）。
- 载荷内无 Date：upcoming 只取名称/daysLeft/amount/auto（date 本身不是信号需求），天然满足「日期一律 ISO 日串」。
