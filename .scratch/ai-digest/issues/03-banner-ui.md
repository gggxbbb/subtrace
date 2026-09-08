# 03 - banner 双态 UI 与异步升级

Type: task

**What to build:** 控制台 banner 组件化：模板先行、指纹命中直出摘要、miss 异步生成原地替换、点击原位展开详细版。spec: `.scratch/ai-digest/spec.md`，ADR-0016。

**Blocked by:** 02

**Status:** open

- [ ] dashboard page 服务端：`upcoming.length > 0` 时先查指纹缓存——命中（非 failed）渲染摘要文案，miss 渲染现有模板文案；未配置 LLM 时永远模板态、客户端不发请求
- [ ] `DigestBanner` client 组件：初始文本由服务端传入（模板或缓存摘要）；模板态时挂载后 `fetch /api/digest`，返回 `kind: "digest"` 则原地替换文本（无 spinner，模板即 loading 态）；单行版保持 truncate；点击 banner 原位展开详细版（多行），再点收回；展开态不进 URL、不进历史
- [ ] chip 标签「待续费」→「摘要」；模板态（含未配置/失败降级）维持「待续费」不改名——模板内容确实是待续费，摘要是摘要，名随其实
- [ ] API 路由 `GET /api/digest`：session 守门，内部 `getDashboardData` + `getDigest`，返回 `{ kind, line?, detail? }`；miss 且生成中并发请求靠 service 层单飞语义
- [ ] 浏览器冒烟：① 未配 env → banner 模板态、零 LLM 请求（DevTools network 验证）；② 配 env（假 base URL 指向本地 stub 或真实 key 任选）→ 首访模板→异步替换单行摘要，刷新秒出缓存，点击展开/收回详细版；③ stub 返回 500 → 保持模板态且 30 分钟内不重试

## Contract

**GET /api/digest** → `200 { kind: "digest"; line: string; detail: string } | { kind: "fallback" }`；401 未登录

**DigestBanner props**：`initial: { mode: "digest"; line: string; detail: string } | { mode: "template"; text: string; enabled: boolean }`（`enabled = llmConfigured()`，false 时组件不 fetch）

## Comments
