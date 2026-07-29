"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "../auth/session";
import { resolveMoney } from "../money";
import { dayField } from "../form";
import { parseDay } from "../dates";
import { createBundle, deleteBundle, replaceBundle, setBundleArchived, type BundleInput, type BundleItemInput } from "./service";


/** 解析向导提交：主体字段 + 子会员 JSON */
async function parsePayload(
  user: { id: string; baseCurrency: string },
  formData: FormData,
): Promise<BundleInput> {
  const parsed = JSON.parse(String(formData.get("items") ?? "[]")) as {
    subscriptionId?: string;
    newName?: string;
    listPriceBase: number | null;
    allocatedBase?: number;
    periodStart?: string;
    periodEnd?: string;
  }[];
  const periodStart = dayField(formData.get("periodStart"));
  const periodEnd = dayField(formData.get("periodEnd"));
  const items: BundleItemInput[] = parsed.map((it) => ({
    subscriptionId: it.subscriptionId || undefined,
    newSubscription: it.newName ? { name: it.newName } : undefined,
    listPriceBase: it.listPriceBase,
    allocatedBase: it.allocatedBase,
    periodStart: it.periodStart ? parseDay(it.periodStart) : periodStart,
    periodEnd: it.periodEnd ? parseDay(it.periodEnd) : periodEnd,
  }));
  // 打包实付三件套（ADR-0010 决策树兜底，无汇率拒绝）
  const total = await resolveMoney(formData, user, {
    names: { amount: "totalAmount", currency: "currency", amountBase: "totalAmountBase" },
  });
  return {
    name: String(formData.get("name") ?? ""),
    totalAmount: total.amount!,
    currency: total.currency!,
    totalAmountBase: total.amountBase!,
    periodStart,
    periodEnd,
    items,
  };
}

export async function createBundleAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  try {
    await createBundle(user.id, await parsePayload(user, formData));
  } catch (e) {
    if (e instanceof Error && "code" in e && e.code === "fx") redirect("/bundles/new?error=fx");
    redirect("/bundles/new?error=1");
  }
  redirect("/bundles");
}

/** 编辑 = 重走向导：全量对账子会员（删旧分摊记录，按新配置重建） */
export async function replaceBundleAction(bundleId: string, formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  try {
    await replaceBundle(user.id, bundleId, await parsePayload(user, formData));
  } catch (e) {
    if (e instanceof Error && "code" in e && e.code === "fx") redirect(`/bundles/${bundleId}/edit?error=fx`);
    redirect(`/bundles/${bundleId}/edit?error=1`);
  }
  revalidatePath("/bundles");
  redirect("/bundles");
}

export async function setBundleArchivedAction(bundleId: string, archived: boolean) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  await setBundleArchived(user.id, bundleId, archived);
  revalidatePath("/bundles");
  redirect("/bundles");
}

export async function deleteBundleAction(bundleId: string) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  await deleteBundle(user.id, bundleId);
  revalidatePath("/bundles");
  redirect("/bundles");
}
