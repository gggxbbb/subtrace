# 02 - 摘要服务：指纹缓存 + LLM caller + 负缓存

Type: task

**What to build:** 摘要缓存表（Prisma 迁移）、OpenAI 兼容 LLM caller（env 三件套）、`getDigest` 服务（命中/生成/负缓存/单飞）。spec: `.scratch/ai-digest/spec.md`，ADR-0016。

**Blocked by:** 01

**Status:** open

- [ ] Prisma 迁移：`DigestCache { fingerprint String @id, userId String, line String, detail String, failed Boolean @default(false), createdAt DateTime @default(now()) }`；migrate + generate 后重启 dev server（仓库高频坑）
- [ ] `src/lib/digest/llm.ts`：`llmConfigured()`（env 三件套齐全才 true）；`defaultCaller` 走 OpenAI 兼容 `POST {LLM_BASE_URL}/chat/completions`，prompt 约束：只许使用输入 JSON 里的数字、禁止编造、返回严格 JSON `{ "line": "≤80字一句", "detail": "多行详细版" }`；`line` 超 80 字服务端截断兜底；调用超时（10s）与 5xx 视为失败
- [ ] `src/lib/digest/service.ts`：`getDigest`——未配置 → `fallback`；指纹命中且 failed=false → 缓存文案；命中 failed=true 且 30 分钟内 → `fallback`（不重试）；miss 或负缓存过期 → 调 caller，成功 upsert（failed=false），失败 upsert（failed=true）并返回 `fallback`；并发 miss 靠 fingerprint 主键 upsert 天然单飞（后写覆盖，可接受）
- [ ] 测试（`src/lib/digest/service.test.ts`，独立测试库 `data/test.db`，caller 注入假实现）：命中不调 caller；miss 调用并落库；caller 抛错 → fallback + 负缓存；30 分钟内不再调（`now` 注入）；双格式解析与 80 字截断

## Contract

**src/lib/digest/service.ts**
- `type LlmCaller = (payload: DigestPayload) => Promise<{ line: string; detail: string }>`
- `type DigestResult = { kind: "digest"; line: string; detail: string } | { kind: "fallback" }`
- `getDigest(d: DashboardData, userId: string, opts?: { caller?: LlmCaller; now?: Date }): Promise<DigestResult>`

**src/lib/digest/llm.ts**
- `llmConfigured(): boolean`
- `defaultCaller: LlmCaller`（未配置时抛错，服务层先用 `llmConfigured` 守门）

## Comments
