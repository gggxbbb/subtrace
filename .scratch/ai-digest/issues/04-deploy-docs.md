# 04 - 部署文档：LLM env 三件套与外发边界

Type: task

**What to build:** README 与 docker-compose 的 LLM 配置说明。spec: `.scratch/ai-digest/spec.md`（Q6/Q8）。

**Blocked by:** —（无）

**Status:** open

- [ ] README 新增「AI 摘要」小节：`LLM_BASE_URL` / `LLM_API_KEY` / `LLM_MODEL` 三件套的语义与示例（OpenAI 兼容端点）；明确写「配置即开启，启用即同意订阅名称、金额、用量统计外发给该端点；不配置则功能不存在」
- [ ] `docker-compose.yml` environment 段加三行注释掉的示例
- [ ] 验收：按 README 配好三件套重启后摘要生效；不配则全站零差异

## Comments
