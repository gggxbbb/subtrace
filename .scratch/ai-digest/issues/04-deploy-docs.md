# 04 - 部署文档：LLM env 三件套与外发边界

Type: task

**What to build:** README 与 docker-compose 的 LLM 配置说明。spec: `.scratch/ai-digest/spec.md`（Q6/Q8）。

**Blocked by:** —（无）

**Status:** resolved

- [x] README 新增「AI 摘要」小节：`LLM_BASE_URL` / `LLM_API_KEY` / `LLM_MODEL` 三件套的语义与示例（OpenAI 兼容端点）；明确写「配置即开启，启用即同意订阅名称、金额、用量统计外发给该端点；不配置则功能不存在」
- [x] `docker-compose.yml` environment 段加三行注释掉的示例
- [x] 验收：按 README 配好三件套重启后摘要生效；不配则全站零差异

## Comments

## Answer

- `README.md` 在「环境变量」表后新增「## AI 摘要（可选）」小节：三件套语义表（含 DeepSeek 示例）、OpenAI 兼容 chat completions 说明、配置即开启 / 启用即同意外发 / 不配则 banner 维持模板态全站零差异，并引 ADR-0016。
- `docker-compose.yml` environment 段末尾（REMINDER_SCHEDULER 注释块之后）加一行引导注释 + 三行注释掉的 `LLM_BASE_URL` / `LLM_API_KEY` / `LLM_MODEL` 示例，风格对齐既有「可选：」注释块；`docker compose config -q` 通过。
- 决策：小节只写部署面事实（接入方式、外发边界、降级行为），缓存/双态渲染等机制留在 ADR-0016 与 spec，README 不重复。
