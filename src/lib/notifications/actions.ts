"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "../auth/session";
import { createChannel, deleteChannel, setChannelEnabled, testChannel, updateChannel } from "./service";

const PATH = "/settings/channels";

/** 表单 → 渠道配置；无效返回 null（调用方走 ?error=1） */
function parseChannelConfig(kind: "WEBHOOK" | "EMAIL", formData: FormData): Record<string, unknown> | null {
  if (kind === "WEBHOOK") {
    const url = String(formData.get("url") ?? "").trim();
    if (!url) return null;
    // 自定义头：每行 "Key: Value"
    const headers: Record<string, string> = {};
    for (const line of String(formData.get("headers") ?? "").split("\n")) {
      const i = line.indexOf(":");
      if (i > 0) headers[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
    return {
      url,
      method: String(formData.get("method") ?? "").trim() || undefined,
      headers: Object.keys(headers).length > 0 ? headers : undefined,
      bodyTemplate: String(formData.get("bodyTemplate") ?? "").trim() || undefined,
    };
  }
  const host = String(formData.get("host") ?? "").trim();
  const port = Number(formData.get("port"));
  const from = String(formData.get("from") ?? "").trim();
  const to = String(formData.get("to") ?? "").trim();
  if (!host || !Number.isInteger(port) || !from || !to) return null;
  return {
    host,
    port,
    secure: formData.get("secure") !== null,
    user: String(formData.get("user") ?? "").trim() || undefined,
    pass: String(formData.get("pass") ?? "") || undefined,
    from,
    to,
  };
}

export async function createChannelAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const kind = String(formData.get("kind")) as "WEBHOOK" | "EMAIL";
  const name = String(formData.get("name") ?? "").trim();
  if (!name || (kind !== "WEBHOOK" && kind !== "EMAIL")) redirect(`${PATH}?error=1`);

  const config = parseChannelConfig(kind, formData);
  if (!config) redirect(`${PATH}?error=1`);

  await createChannel(user.id, { kind, name, config });
  revalidatePath(PATH);
  redirect(PATH);
}

/** 原地编辑：类型不可改（表单不回传 kind）；pass/敏感头缺席 = 保留原值（service 层保证） */
export async function updateChannelAction(channelId: string, formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const kind = String(formData.get("kind")) as "WEBHOOK" | "EMAIL";
  const name = String(formData.get("name") ?? "").trim();
  if (!name || (kind !== "WEBHOOK" && kind !== "EMAIL")) redirect(`${PATH}?error=1`);

  const config = parseChannelConfig(kind, formData);
  if (!config) redirect(`${PATH}?error=1`);

  await updateChannel(user.id, channelId, { name, config });
  revalidatePath(PATH);
}

export async function toggleChannelAction(channelId: string, enabled: boolean) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  await setChannelEnabled(user.id, channelId, enabled);
  revalidatePath(PATH);
}

export async function deleteChannelAction(channelId: string) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  await deleteChannel(user.id, channelId);
  revalidatePath(PATH);
}

/** 试发：返回结果给客户端提示 */
export async function testChannelAction(channelId: string): Promise<{ ok: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "未登录" };
  const result = await testChannel(user.id, channelId);
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}
