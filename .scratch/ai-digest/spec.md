# ai-digest：控制台 AI 摘要

## 背景

控制台顶部 banner 现为纯模板字符串（`upcoming` 拼一句话），只覆盖「30 天内到期」一个信号。引擎已算出的盈亏、浪费、陈旧、支出水平、回本进度全部躺在各自板块里，没有人替用户排优先级。grilling 十问拍板引入 AI 摘要（Q1–Q10 全录于下），核心立场见 ADR-0016：**AI 只综合与转述引擎既有数字，不生产新事实、不开处方**。

## 拍板决策

**定位（Q1/Q2）**：跨信号摘要。引擎出数字，AI 选题 + 排序 + 成文。AI 直接开处方的路线否决——退订判据是盈亏引擎的 verdict，AI 自由发挥会与红黑榜口径打架。

**信号源（Q3）**：全量喂入 `getDashboardData` 已算信号——`upcoming`（到期/金额/自动手动/天数）、`usageBoard`（verdictAmount / wasteNote / stale / countdown）、`monthSpent` / `yearSpent` / `trend`、`purchases`（daysHeld / progress）。AI 自选最值得说的 1–3 件。选题本身是 AI 的活，不预设过滤规则。

**新鲜度（Q4）**：指纹缓存。信号 payload 稳定序列化后哈希（含用户 ID）作 key，指纹变才调 LLM，命中直读。成功条目不设 TTL（指纹变化自然淘汰）；不做每日 cron（与「录入后全站数字一致」冲突）。

**渲染（Q5）**：模板先行、异步升级。首屏永远秒出：指纹命中 → 缓存 AI 文案；miss → 现有模板文案（占位 + loading + 降级三合一），客户端后台请求生成，完成原地替换。LLM 挂了用户看到的就是今天的模板 banner，完全无感。

**模型接入（Q6）**：实例级环境变量 `LLM_BASE_URL` / `LLM_API_KEY` / `LLM_MODEL`，OpenAI 兼容 chat completions 协议。零新 UI。

**失败（Q7）**：失败结果按指纹负缓存，TTL 30 分钟，过期放行重试；不刷屏、一次抖动不毁一天。并发 miss 以指纹唯一键单飞。

**隐私（Q8）**：配置即开启——env 三件套配齐功能才存在，不配则代码路径不激活、banner 永远模板态。启用即同意订阅名/金额/用量外发，README 写明边界，不做脱敏表演。

**呈现（Q9/Q10）**：单次调用返回**单行版**（一句连贯中文 ≤80 字）与**详细版**（多行），同落指纹缓存。banner 保持单行 truncate 常态，chip 标签由「待续费」改「摘要」；点击 banner 原位展开显示详细版，再点收回。展开态不进 URL。

## 测试接缝（已确认）

1. **载荷与指纹（纯函数）**：`buildDigestPayload(dashboardData, userId)` + `digestFingerprint(payload)`。测指纹稳定性（键序/日期/浮点）、信号变则指纹变、展示态无关字段不进指纹。Vitest 直测。
2. **摘要服务（注入 LLM）**：`getDigest(userId, { caller })`，caller 注入假 LLM。测命中不调、miss 落缓存、失败负缓存 + TTL 内不重试 + 返回 fallback、双格式解析（单行版 >80 字处理）、并发单飞。仓储层走 `data/test.db`（同现有 service.test.ts）。

UI 层（banner 双态、模板先行、异步替换）浏览器冒烟，不立单测。

## 验收口径

- 未配 env 三件套：全站零差异，banner 维持模板态，无任何 LLM 请求发出
- 配置后：首访 banner 先模板、摘要生成后原地替换为单行版；刷新（数据未变）秒出缓存文案，无二次 LLM 调用
- 录入一笔用量/付费后再访问：指纹变化，摘要重新生成
- LLM 不可达：banner 保持模板态，30 分钟内重复访问不重复打外部请求
- banner 点击原位展开详细版，再点收回；chip 显示「摘要」
- 摘要内容只含引擎已算数字（人工抽查 prompt 约束生效）
