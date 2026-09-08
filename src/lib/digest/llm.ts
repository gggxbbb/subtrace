// OpenAI 兼容 LLM caller（ADR-0016/Q6）：实例级 env 三件套（LLM_BASE_URL/LLM_API_KEY/LLM_MODEL）
// 配齐功能才存在，不配则服务层直接 fallback、代码路径不激活。非 2xx/超时/解析失败一律 throw，
// 由服务层捕为负缓存。

import type { DigestPayload } from "./payload";

export type LlmCaller = (payload: DigestPayload) => Promise<{ line: string; detail: string }>;

const TIMEOUT_MS = 10_000;

/** env 三件套齐全才 true（配置即开启） */
export function llmConfigured(): boolean {
  return Boolean(process.env.LLM_BASE_URL && process.env.LLM_API_KEY && process.env.LLM_MODEL);
}

const SYSTEM_PROMPT = [
  "你是订阅/支出管理应用的「摘要」撰写器。输入是一份 JSON，包含引擎已算出的信号：",
  "upcoming（30 天内到期：name/daysLeft/amount/auto）、usageBoard（滑动窗盈亏：",
  "name/verdictAmount(净盈亏,负=亏)/wasteNote(浪费事件)/stale(快照陈旧)/countdown/windowLabel/",
  "quantityLabel/paid(付了)/value(用回)/costUnknown/valueUnknown）、monthSpent/yearSpent（支出水平）、",
  "trend（近 30 天支出 total/average）、purchases（耐用品回本：name/daysHeld/progress/status）。",
  "铁律：",
  "1. 只许使用输入 JSON 中出现的数字与事实，禁止编造任何未出现的数字、日期或结论；",
  "2. 不开处方（不说「退订」「换套餐」），只综合与转述引擎已算出的数字；",
  "3. 自选最值得说的 1–3 件，按重要性排序；",
  "4. 输出严格 JSON：{\"line\": \"...\", \"detail\": \"...\"}，不要输出任何其他文字；",
  "   - line：一句连贯中文，不超过 80 字，用于顶部 banner 单行展示；",
  "   - detail：多行详细版（每行一条信号，可含数字明细），供点击展开阅读。",
].join("\n");

/** 从 content 提取首个 JSON 对象：先整串 parse，失败则截取首个 { 到末个 } 容错（markdown 围栏等） */
function extractLlmJson(content: string): { line: string; detail: string } {
  const trimmed = content.trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start === -1 || end <= start) throw new Error("LLM 响应中找不到 JSON 对象");
    parsed = JSON.parse(trimmed.slice(start, end + 1));
  }
  const obj = parsed as Record<string, unknown> | null;
  if (!obj || typeof obj.line !== "string" || typeof obj.detail !== "string") {
    throw new Error("LLM 响应缺少 line/detail 字符串字段");
  }
  return { line: obj.line, detail: obj.detail };
}

async function postChatCompletions(
  baseUrl: string,
  apiKey: string,
  body: Record<string, unknown>,
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`LLM HTTP ${res.status}`);
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: unknown } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== "string") throw new Error("LLM 响应缺少 choices[0].message.content");
    return content;
  } finally {
    clearTimeout(timer);
  }
}

/** 默认 caller：未配置抛错（服务层先用 llmConfigured 守门，正常走不到） */
export const defaultCaller: LlmCaller = async (payload) => {
  const baseUrl = process.env.LLM_BASE_URL;
  const apiKey = process.env.LLM_API_KEY;
  const model = process.env.LLM_MODEL;
  if (!baseUrl || !apiKey || !model) {
    throw new Error("LLM 未配置（LLM_BASE_URL/LLM_API_KEY/LLM_MODEL 缺一）");
  }

  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: JSON.stringify(payload) },
  ];
  // response_format=json_object 并非所有 OpenAI 兼容端点都支持：先带上，400 则降级重试一次不带它
  try {
    const content = await postChatCompletions(baseUrl, apiKey, {
      model,
      messages,
      response_format: { type: "json_object" },
    });
    return extractLlmJson(content);
  } catch (err) {
    if (err instanceof Error && err.message === "LLM HTTP 400") {
      const content = await postChatCompletions(baseUrl, apiKey, { model, messages });
      return extractLlmJson(content);
    }
    throw err;
  }
};
