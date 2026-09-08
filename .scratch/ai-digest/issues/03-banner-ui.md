# 03 - banner 双态 UI 与异步升级

Type: task

**What to build:** 控制台 banner 组件化：模板先行、指纹命中直出摘要、miss 异步生成原地替换、点击原位展开详细版。spec: `.scratch/ai-digest/spec.md`，ADR-0016。

**Blocked by:** 02

**Status:** resolved

- [x] dashboard page 服务端：`upcoming.length > 0` 时先查指纹缓存——命中（非 failed）渲染摘要文案，miss 渲染现有模板文案；未配置 LLM 时永远模板态、客户端不发请求
- [x] `DigestBanner` client 组件：初始文本由服务端传入（模板或缓存摘要）；模板态时挂载后 `fetch /api/digest`，返回 `kind: "digest"` 则原地替换文本（无 spinner，模板即 loading 态）；单行版保持 truncate；点击 banner 原位展开详细版（多行），再点收回；展开态不进 URL、不进历史
- [x] chip 标签「待续费」→「摘要」；模板态（含未配置/失败降级）维持「待续费」不改名——模板内容确实是待续费，摘要是摘要，名随其实
- [x] API 路由 `GET /api/digest`：session 守门，内部 `getDashboardData` + `getDigest`，返回 `{ kind, line?, detail? }`；miss 且生成中并发请求靠 service 层单飞语义
- [x] 浏览器冒烟：① 未配 env → banner 模板态、零 LLM 请求（DevTools network 验证）；② 配 env（假 base URL 指向本地 stub 或真实 key 任选）→ 首访模板→异步替换单行摘要，刷新秒出缓存，点击展开/收回详细版；③ stub 返回 500 → 保持模板态且 30 分钟内不重试

## Contract

**GET /api/digest** → `200 { kind: "digest"; line: string; detail: string } | { kind: "fallback" }`；401 未登录

**DigestBanner props**：`initial: { mode: "digest"; line: string; detail: string } | { mode: "template"; text: string; enabled: boolean }`（`enabled = llmConfigured()`，false 时组件不 fetch）

## Comments

## Answer

**改动**
- `src/app/api/digest/route.ts`（新建）：`getCurrentUser()` 无 session 返 401 `{ error: "未登录" }`；有 session → `getDashboardData(user.id)` + `getDigest(d, user.id)`，直接透传 `{ kind: "digest", line, detail } | { kind: "fallback" }`。
- `src/components/DigestBanner.tsx`（新建 client 组件）：props 按契约 `initial: digest | template(enabled)`。模板态渲染原视觉（AlertTriangle + chip「待续费」+ 模板文本 + 查看全部链接）；`enabled=true` 挂载后 fetch `/api/digest`，`kind:"digest"` 原地替换为单行摘要（chip 换「摘要」、truncate 保持），fallback 不变。摘要态点击文本区原位展开 detail（`whitespace-pre-wrap` 多行），再点收回；纯 React state，不进 URL。
- `src/app/(app)/dashboard/page.tsx`：`upcoming.length > 0` 时构造模板文案，`llmConfigured()` 为真再 `buildDigestPayload` + `digestFingerprint` 查 `DigestCache`，命中非 failed 以 `mode:"digest"` 直出；否则 `mode:"template"`（enabled 即 llmConfigured）。原 49–68 行内联 banner 换为 `<DigestBanner initial={banner} />`。

**验证**
- `pnpm exec tsc --noEmit` 通过，无新错误。
- 冒烟前置：gggxbbb 无 30 天内到期订阅，直插一条 `AI摘要冒烟订阅`（anchor=今天-20 天、月付、¥68、auto）使 banner 可渲染。
- ① 无 LLM env：banner 模板态（「待续费 1 个订阅将在 30 天内到期，AI摘要冒烟订阅 将于 11 天后自动扣费」），performance resource entries 中 `/api/digest` 请求数 = 0。
- ② hub 重启 web 带 `LLM_BASE_URL=http://127.0.0.1:3999 LLM_API_KEY=test LLM_MODEL=stub`（本地 stub `.scratch/llm-stub.mjs`，计数器）：首访 400ms 内模板异步替换为「摘要 冒烟摘要：1 个订阅即将到期，本月支出为零。」，stub 计数=1；点击展开 detail 两行（pre-wrap 生效），再点收回，URL 始终 `/dashboard`；刷新后 300ms 服务端直出摘要、`/api/digest` 客户端请求 0 次、stub 计数仍=1（缓存直出）。
- ③ stub 改 500 模式 + 改 anchor 换指纹：banner 保持模板态（chip「待续费」），stub 计数=1（首次 miss 调用失败落负缓存）；4 秒后再次访问，客户端仍发 `/api/digest`（service 层负缓存直接 fallback），stub 计数仍=1——30 分钟内无新 LLM 请求。
- 冒烟后 web 已 stop + 无 env 重新 start 恢复（`Ready in` 确认），最终无 env 态复查 banner 模板态、零 `/api/digest` 请求。
