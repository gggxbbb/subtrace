"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "../auth/session";
import {
  addQuotaSnapshot,
  addUsage,
  deleteUsage,
  setUsageConfig,
} from "./service";
import { prisma } from "../db";

const parseDate = (v: FormDataEntryValue | null) => new Date(`${String(v)}T00:00:00Z`);

export async function setUsageConfigAction(subscriptionId: string, formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  await setUsageConfig(user.id, subscriptionId, {
    usageKind: String(formData.get("usageKind")) as "COUNT" | "QUOTA",
    usageUnit: String(formData.get("usageUnit") ?? ""),
    altUnitPrice: formData.get("altUnitPrice") ? Number(formData.get("altUnitPrice")) : undefined,
    quotaTotal: formData.get("quotaTotal") ? Number(formData.get("quotaTotal")) : undefined,
  });
  revalidatePath(`/subscriptions/${subscriptionId}`);
  redirect(`/subscriptions/${subscriptionId}`);
}

export async function addUsageAction(subscriptionId: string, formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const unitPrice = formData.get("unitPrice");
  await addUsage(user.id, subscriptionId, user.id, {
    date: parseDate(formData.get("date")),
    quantity: Number(formData.get("quantity")),
    unitPrice: unitPrice && String(unitPrice).trim() !== "" ? Number(unitPrice) : undefined,
  });
  revalidatePath(`/subscriptions/${subscriptionId}`);
  redirect(`/subscriptions/${subscriptionId}`);
}

export async function addQuotaSnapshotAction(subscriptionId: string, formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const percent = formData.get("percent");
  const used = formData.get("used");
  const unitPrice = formData.get("unitPrice");
  const quotaTotal = formData.get("quotaTotal");
  await addQuotaSnapshot(user.id, subscriptionId, user.id, {
    date: parseDate(formData.get("date")),
    percent: percent && String(percent).trim() !== "" ? Number(percent) : undefined,
    used: used && String(used).trim() !== "" ? Number(used) : undefined,
    unitPrice: unitPrice && String(unitPrice).trim() !== "" ? Number(unitPrice) : undefined,
    quotaTotal: quotaTotal && String(quotaTotal).trim() !== "" ? Number(quotaTotal) : undefined,
  });
  revalidatePath(`/subscriptions/${subscriptionId}`);
  redirect(`/subscriptions/${subscriptionId}`);
}


export async function deleteUsageAction(subscriptionId: string, usageId: string) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  await deleteUsage(user.id, usageId);
  revalidatePath(`/subscriptions/${subscriptionId}`);
  redirect(`/subscriptions/${subscriptionId}`);
}

/** 停用用量跟踪：清空类型（记录保留，重新启用时可恢复解读） */
export async function disableUsageAction(subscriptionId: string) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  await prisma.subscription.updateMany({
    where: { id: subscriptionId, ownerId: user.id },
    data: { usageKind: null },
  });
  revalidatePath(`/subscriptions/${subscriptionId}`);
  redirect(`/subscriptions/${subscriptionId}`);
}

/** 停用并清除全部用量记录（不可恢复） */
export async function purgeUsageAction(subscriptionId: string) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  await prisma.usageRecord.deleteMany({
    where: { subscriptionId, subscription: { ownerId: user.id } },
  });
  await prisma.subscription.updateMany({
    where: { id: subscriptionId, ownerId: user.id },
    data: { usageKind: null },
  });
  revalidatePath(`/subscriptions/${subscriptionId}`);
  redirect(`/subscriptions/${subscriptionId}`);
}
