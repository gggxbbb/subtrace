# 02 - 摘要服务：指纹缓存 + LLM caller + 负缓存

Type: task

**What to build:** 摘要缓存表（Prisma 迁移）、OpenAI 兼容 LLM caller（env 三件套）、`getDigest` 服务（命中/生成/负缓存/单飞）。spec: `.scratch/ai-digest/spec.md`，ADR-0016。

**Blocked by:** 01

**Status:** resolved

- [x] Prisma 迁移：`DigestCache { fingerprint String @id, userId String, line String, detail String, failed Boolean @default(false), createdAt DateTime @default(now()) }`；migrate + generate 后重启 dev server（仓库高频坑）
- [x] `src/lib/digest/llm.ts`：`llmConfigured()`（env 三件套齐全才 true）；`defaultCaller` 走 OpenAI 兼容 `POST {LLM_BASE_URL}/chat/completions`，prompt 约束：只许使用输入 JSON 里的数字、禁止编造、返回严格 JSON `{ "line": "≤80字一句", "detail": "多行详细版" }`；`line` 超 80 字服务端截断兜底；调用超时（10s）与 5xx 视为失败
- [x] `src/lib/digest/service.ts`：`getDigest`——未配置 → `fallback`；指纹命中且 failed=false → 缓存文案；命中 failed=true 且 30 分钟内 → `fallback`（不重试）；miss 或负缓存过期 → 调 caller，成功 upsert（failed=false），失败 upsert（failed=true）并返回 `fallback`；并发 miss 靠 fingerprint 主键 upsert 天然单飞（后写覆盖，可接受）
- [x] 测试（`src/lib/digest/service.test.ts`，独立测试库 `data/test.db`，caller 注入假实现）：命中不调 caller；miss 调用并落库；caller 抛错 → fallback + 负缓存；30 分钟内不再调（`now` 注入）；双格式解析与 80 字截断

## Contract

**src/lib/digest/service.ts**
- `type LlmCaller = (payload: DigestPayload) => Promise<{ line: string; detail: string }>`
- `type DigestResult = { kind: "digest"; line: string; detail: string } | { kind: "fallback" }`
- `getDigest(d: DashboardData, userId: string, opts?: { caller?: LlmCaller; now?: Date }): Promise<DigestResult>`

**src/lib/digest/llm.ts**
- `llmConfigured(): boolean`
- `defaultCaller: LlmCaller`（未配置时抛错，服务层先用 `llmConfigured` 守门）

## Comments

## Answer

**实现位置**
- `prisma/schema.prisma` 尾部新增 `DigestCache` 模型（契约字段原样）；迁移 `prisma/migrations/20260908081326_digest_cache/migration.sql`，已 `migrate dev` 应用到 dev 库并 `generate` 到 `src/generated/prisma`（dev server 重启由父代理/用户收口，本 ticket 不动 UI）。
- `src/lib/digest/llm.ts`：`llmConfigured()` + `defaultCaller`。`LlmCaller` 类型定义在此并由 service.ts `export type` 再导出，满足契约里两个文件都能引到该类型。
- `src/lib/digest/service.ts`：`DigestResult` + `getDigest`。
- `src/lib/digest/service.test.ts`：6 个用例全绿（命中不调 / miss 双格式落库 / 80 字截断 / 并发单飞 / 负缓存 29 分钟不调+31 分钟放行 / 未配置 fallback 不落库）。

- **单飞用进程内 inflight Map**：票据正文说「upsert 天然单飞、后写覆盖可接受」，但验收要求「并发两个 getDigest 同指纹 → caller 只调一次」——upsert 本身止不住两个并发 caller，故加进程内 `Map<fingerprint, Promise>` 去重（单实例部署 ADR-0005，够用）；跨进程仍靠主键 upsert 兜底。并发测试用 `Promise.withResolvers` 闸门 caller 确定性制造在途窗口，不用真实定时器。
- **llmConfigured 守门在 caller 注入之前**：即使注入了 caller，env 三件套不齐也直接 fallback（「配置即开启，不配则代码路径不激活」）。测试用 `vi.stubEnv` 配齐三件套，未配置用例 unstub。
- **负缓存 upsert 刷新 createdAt 为注入的 now**：TTL 基准跟随 `now` 参数，测试确定性。
- **line 截断在服务端兜底**：`[...line].slice(0, 80)` 按码点切，不切半 surrogate pair；截断后的值同时用于落库与返回。
- **defaultCaller 容错**：先带 `response_format: json_object`，HTTP 400 降级重试一次不带（端点不支持也能跑）；解析先整串 `JSON.parse`，失败则截取首个 `{` 到末个 `}` 再 parse（markdown 围栏容错）；缺 line/detail 字符串字段即 throw。10s AbortController 超时；非 2xx/超时/解析失败一律 throw，由服务层捕为负缓存。

**坑**
- `pnpm prisma migrate dev` 后必须再 `pnpm prisma generate`，否则 `prisma.digestCache` 在 client 类型里不存在（本次按流程做了，无坑）。
- 验证：`pnpm exec vitest run src/lib/digest/service.test.ts` 6/6 绿；`pnpm exec tsc --noEmit` 无输出；dev 库 `DigestCache` 表已建（sqlite_master 查得 DDL）。
