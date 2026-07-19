"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "../auth/session";
import { createBundle, deleteBundle, replaceBundle, setBundleArchived, type BundleInput, type BundleItemInput } from "./service";

const parseDate = (v: FormDataEntryValue | null) => new Date(`${String(v)}T00:00:00Z`);

/** 解析向导提交：主体字段 + 子会员 JSON */
function parsePayload(formData: FormData): BundleInput {
  const parsed = JSON.parse(String(formData.get("items") ?? "[]")) as {
    subscriptionId?: string;
    newName?: string;
    listPriceBase: number | null;
    allocatedBase?: number;
    periodStart?: string;
    periodEnd?: string;
  }[];
  const periodStart = parseDate(formData.get("periodStart"));
  const periodEnd = parseDate(formData.get("periodEnd"));
  const items: BundleItemInput[] = parsed.map((it) => ({
    subscriptionId: it.subscriptionId || undefined,
    newSubscription: it.newName ? { name: it.newName } : undefined,
    listPriceBase: it.listPriceBase,
    allocatedBase: it.allocatedBase,
    periodStart: it.periodStart ? new Date(`${it.periodStart}T00:00:00Z`) : periodStart,
    periodEnd: it.periodEnd ? new Date(`${it.periodEnd}T00:00:00Z`) : periodEnd,
  }));
  return {
    name: String(formData.get("name") ?? ""),
    totalAmount: Number(formData.get("totalAmount")),
    currency: String(formData.get("currency") ?? "CNY"),
    totalAmountBase: Number(formData.get("totalAmountBase") ?? formData.get("totalAmount")),
    periodStart,
    periodEnd,
    items,
  };
}

export async function createBundleAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  try {
    await createBundle(user.id, parsePayload(formData));
  } catch {
    redirect("/bundles/new?error=1");
  }
  redirect("/bundles");
}

/** 编辑 = 重走向导：全量对账子会员（删旧分摊记录，按新配置重建） */
export async function replaceBundleAction(bundleId: string, formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  try {
    await replaceBundle(user.id, bundleId, parsePayload(formData));
  } catch {
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
