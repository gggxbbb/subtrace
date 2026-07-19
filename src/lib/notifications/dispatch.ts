// 通知派发（ticket 08）：把一条提醒送达一个渠道。纯函数缝，测试注入替身。

import nodemailer from "nodemailer";

export interface NotifyPayload {
  title: string;
  body: string;
  /** 附加上下文（订阅 id、到期日、提前天数），webhook 原样透传 */
  meta?: Record<string, unknown>;
}

export type DeliverResult = { ok: true } | { ok: false; error: string };

export interface WebhookConfig {
  url: string;
  /** 默认 POST */
  method?: string;
  /** 自定义请求头（content-type 缺省 application/json） */
  headers?: Record<string, string>;
  /** 请求体模板：{{title}} {{body}} {{meta.xxx}} 占位替换；为空发默认 JSON {title, body, meta} */
  bodyTemplate?: string;
}

/** 模板占位替换：{{title}} / {{body}} / {{meta.a.b}}（点路径，缺失→空串） */
export function renderTemplate(template: string, payload: NotifyPayload): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, path: string) => {
    let cur: unknown = payload;
    for (const key of path.split(".")) {
      cur = cur !== null && typeof cur === "object" ? (cur as Record<string, unknown>)[key] : undefined;
    }
    return cur === undefined || cur === null ? "" : String(cur);
  });
}

export interface EmailConfig {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
  from: string;
  to: string;
}

export async function deliverWebhook(config: WebhookConfig, payload: NotifyPayload): Promise<DeliverResult> {
  try {
    const headers: Record<string, string> = { ...(config.headers ?? {}) };
    let body: string;
    if (config.bodyTemplate?.trim()) {
      body = renderTemplate(config.bodyTemplate, payload);
    } else {
      body = JSON.stringify(payload);
      if (!Object.keys(headers).some((k) => k.toLowerCase() === "content-type")) {
        headers["content-type"] = "application/json";
      }
    }
    const res = await fetch(config.url, {
      method: config.method?.trim() || "POST",
      headers,
      body,
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function deliverEmail(config: EmailConfig, payload: NotifyPayload): Promise<DeliverResult> {
  try {
    const transport = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: config.user ? { user: config.user, pass: config.pass } : undefined,
    });
    await transport.sendMail({
      from: config.from,
      to: config.to,
      subject: payload.title,
      text: payload.body,
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** 按渠道类型分发。kind/config 与 NotificationChannel 表一致。 */
export function deliver(kind: string, config: unknown, payload: NotifyPayload): Promise<DeliverResult> {
  if (kind === "WEBHOOK") return deliverWebhook(config as WebhookConfig, payload);
  if (kind === "EMAIL") return deliverEmail(config as EmailConfig, payload);
  return Promise.resolve({ ok: false, error: `未知渠道类型 ${kind}` });
}
