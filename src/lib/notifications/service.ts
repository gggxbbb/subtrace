// 通知渠道服务（ticket 08）：用户级 CRUD + 启停 + 试发。

import { prisma } from "../db";
import { deliver, type DeliverResult } from "./dispatch";

export interface ChannelView {
  id: string;
  kind: string;
  name: string;
  config: Record<string, unknown>;
  enabled: boolean;
}

function toView(c: { id: string; kind: string; name: string; config: string; enabled: boolean }): ChannelView {
  let config: Record<string, unknown> = {};
  try {
    config = JSON.parse(c.config) as Record<string, unknown>;
  } catch {
    /* 配置损坏时当空对象，页面不至于崩 */
  }
  // 密钥不出服务端：RSC payload 不带密码/授权头
  delete config.pass;
  if (config.headers && typeof config.headers === "object") {
    for (const k of Object.keys(config.headers as Record<string, unknown>)) {
      if (["authorization", "x-api-key", "token"].includes(k.toLowerCase())) {
        delete (config.headers as Record<string, unknown>)[k];
      }
    }
  }
  return { id: c.id, kind: c.kind, name: c.name, config, enabled: c.enabled };
}

export async function listChannels(userId: string): Promise<ChannelView[]> {
  const rows = await prisma.notificationChannel.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
  });
  return rows.map(toView);
}

export async function createChannel(
  userId: string,
  input: { kind: "WEBHOOK" | "EMAIL"; name: string; config: Record<string, unknown> },
): Promise<void> {
  await prisma.notificationChannel.create({
    data: { userId, kind: input.kind, name: input.name, config: JSON.stringify(input.config) },
  });
}

export async function setChannelEnabled(userId: string, channelId: string, enabled: boolean): Promise<void> {
  await prisma.notificationChannel.updateMany({ where: { id: channelId, userId }, data: { enabled } });
}

/** 视图脱敏时下剥的敏感头名（与 toView 同口径） */
const SENSITIVE_HEADERS = ["authorization", "x-api-key", "token"];

/**
 * 原地更新渠道：仅名称与配置可改，类型与启停状态不被触碰。
 * 密钥语义：pass / 敏感头（authorization、x-api-key、token）在输入中缺席 = 保留原值
 * （客户端拿不到这些字段，编辑提交自然缺席）；显式提供 = 替换。
 */
export async function updateChannel(
  userId: string,
  channelId: string,
  input: { name: string; config: Record<string, unknown> },
): Promise<void> {
  const existing = await prisma.notificationChannel.findFirst({ where: { id: channelId, userId } });
  if (!existing) throw new Error("渠道不存在 channel_not_found");
  const oldConfig = JSON.parse(existing.config) as Record<string, unknown>;
  const config: Record<string, unknown> = { ...input.config };

  if (config.pass === undefined && oldConfig.pass !== undefined) config.pass = oldConfig.pass;

  const oldHeaders = (oldConfig.headers ?? {}) as Record<string, string>;
  const newHeaders = { ...((config.headers ?? {}) as Record<string, string>) };
  for (const [k, v] of Object.entries(oldHeaders)) {
    if (SENSITIVE_HEADERS.includes(k.toLowerCase()) && !(k in newHeaders)) newHeaders[k] = v;
  }
  if (config.headers !== undefined || Object.keys(newHeaders).length > 0) {
    config.headers = newHeaders;
  }

  await prisma.notificationChannel.updateMany({
    where: { id: channelId, userId },
    data: { name: input.name, config: JSON.stringify(config) },
  });
}

export async function deleteChannel(userId: string, channelId: string): Promise<void> {
  await prisma.notificationChannel.deleteMany({ where: { id: channelId, userId } });
}

/** 试发一条测试消息，返回派发结果（不落投递记录）。 */
export async function testChannel(userId: string, channelId: string): Promise<DeliverResult> {
  const c = await prisma.notificationChannel.findFirst({ where: { id: channelId, userId } });
  if (!c) return { ok: false, error: "渠道不存在" };
  let config: unknown;
  try {
    config = JSON.parse(c.config);
  } catch {
    return { ok: false, error: "渠道配置损坏" };
  }
  return deliver(c.kind, config, {
    title: "[subtrace] 渠道测试",
    body: `渠道「${c.name}」配置有效，这是一条测试消息。`,
  });
}
