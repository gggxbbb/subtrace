"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "../auth/session";
import { runScriptNow, saveScript } from "./service";

const PATH = "/settings/scripts";

export async function saveScriptAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const subscriptionId = String(formData.get("subscriptionId") ?? "");
  try {
    await saveScript(user.id, subscriptionId, {
      script: String(formData.get("script") ?? ""),
      scriptCron: String(formData.get("scriptCron") ?? ""),
      scriptEnv: formData.get("scriptEnv") !== null ? String(formData.get("scriptEnv")) : undefined,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    redirect(`${PATH}?error=${encodeURIComponent(msg)}`);
  }
  revalidatePath(PATH);
  redirect(`${PATH}?sub=${subscriptionId}`);
}

/** 立即运行：返回结果给客户端展示 */
export async function runScriptNowAction(subscriptionId: string): Promise<{ ok: boolean; message: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "未登录" };
  const result = await runScriptNow(user.id, subscriptionId);
  revalidatePath(PATH);
  return result;
}
