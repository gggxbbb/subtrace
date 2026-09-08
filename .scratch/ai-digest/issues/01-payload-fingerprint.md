# 01 - 摘要载荷与指纹（纯函数）

Type: task

**What to build:** AI 摘要的信号载荷构造与指纹哈希，纯函数模块，Vitest 直测。spec: `.scratch/ai-digest/spec.md`，立场 ADR-0016。

**Blocked by:** —（无）

**Status:** open

- [ ] `src/lib/digest/payload.ts`：`buildDigestPayload` 从 `DashboardData` 提取全部信号为可序列化 JSON——upcoming（名称/天数/金额/自动）、usageBoard（名称/verdictAmount/wasteNote/stale/countdown/windowLabel/quantityLabel/paid/value）、monthSpent/yearSpent、近 30 天 trend 聚合值（总额/均值，不塞 30 个原始点）、purchases（名称/daysHeld/progress）、主币种。展示态字段（trend 原始序列、entryRows、quickTuples 等录入台专用）不进载荷
- [ ] `digestFingerprint(payload, userId)`：稳定序列化（对象键排序、日期 ISO、数字定点化）后 sha256 hex；指纹输入含 userId
- [ ] 测试（Vitest 纯函数，无 DB）：同输入同指纹（键序无关）；任一信号值变化 → 指纹变；不同 userId 同数据 → 指纹不同；金额浮点（0.1+0.2 类）定点化后不抖

## Contract

**src/lib/digest/payload.ts**
- `buildDigestPayload(d: DashboardData): DigestPayload` — 纯函数，`DigestPayload` 为 JSON-safe 结构（无 Date 实例，日期一律 ISO 日串）
- `digestFingerprint(payload: DigestPayload, userId: string): string` — sha256 hex；同一 (payload, userId) 必得同值

## Comments
