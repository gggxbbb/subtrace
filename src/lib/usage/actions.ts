"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "../auth/session";
import { dayField } from "../form";
import {
  addPack,
  addQuotaSnapshot,
  addSavings,
  addUsage,
  deletePack,
  deleteUsage,
  setUsageConfig,
  updatePack,
  updateUsage,
  type GrantMode,
  type UsageKind,
} from "./service";
import { prisma } from "../db";


export async function setUsageConfigAction(subscriptionId: string, formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const grantMode = String(formData.get("grantMode") ?? "");
  const packValidMonths = formData.get("packValidMonths");
  await setUsageConfig(user.id, subscriptionId, {
    usageKind: String(formData.get("usageKind")) as UsageKind,
    usageUnit: String(formData.get("usageUnit") ?? ""),
    altUnitPrice: formData.get("altUnitPrice") ? Number(formData.get("altUnitPrice")) : undefined,
    quotaTotal: formData.get("quotaTotal") ? Number(formData.get("quotaTotal")) : undefined,
    grantMode: grantMode === "STACKED" ? "STACKED" : (grantMode === "RESET" ? "RESET" : undefined) as GrantMode | undefined,
    packValidMonths: packValidMonths && String(packValidMonths).trim() !== "" ? Number(packValidMonths) : undefined,
  });
  revalidatePath(`/subscriptions/${subscriptionId}`);
  redirect(`/subscriptions/${subscriptionId}`);
}

export async function addUsageAction(subscriptionId: string, formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const unitPrice = formData.get("unitPrice");
  await addUsage(user.id, subscriptionId, user.id, {
    date: dayField(formData.get("date")),
    quantity: Number(formData.get("quantity")),
    unitPrice: unitPrice && String(unitPrice).trim() !== "" ? Number(unitPrice) : undefined,
  });
  revalidatePath(`/subscriptions/${subscriptionId}`);
  const back = formData.get("back");
  redirect(back ? `/subscriptions/${subscriptionId}/usage/records?${back}` : `/subscriptions/${subscriptionId}`);
}

export async function addQuotaSnapshotAction(subscriptionId: string, formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const percent = formData.get("percent");
  const used = formData.get("used");
  const remaining = formData.get("remaining");
  const unitPrice = formData.get("unitPrice");
  const quotaTotal = formData.get("quotaTotal");
  await addQuotaSnapshot(user.id, subscriptionId, user.id, {
    date: dayField(formData.get("date")),
    percent: percent && String(percent).trim() !== "" ? Number(percent) : undefined,
    used: used && String(used).trim() !== "" ? Number(used) : undefined,
    remaining: remaining && String(remaining).trim() !== "" ? Number(remaining) : undefined,
    unitPrice: unitPrice && String(unitPrice).trim() !== "" ? Number(unitPrice) : undefined,
    quotaTotal: quotaTotal && String(quotaTotal).trim() !== "" ? Number(quotaTotal) : undefined,
  });
  revalidatePath(`/subscriptions/${subscriptionId}`);
  redirect(`/subscriptions/${subscriptionId}`);
}

// ===== 额度包（ADR-0012）：手动包增删改（AUTO 只读，由生成器维护） =====

export async function addPackAction(subscriptionId: string, formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  await addPack(user.id, subscriptionId, {
    grantedAt: dayField(formData.get("grantedAt")),
    quantity: Number(formData.get("quantity")),
    expiresAt: dayField(formData.get("expiresAt")),
  });
  revalidatePath(`/subscriptions/${subscriptionId}`);
  redirect(`/subscriptions/${subscriptionId}`);
}

export async function updatePackAction(subscriptionId: string, packId: string, formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  await updatePack(user.id, packId, {
    grantedAt: formData.get("grantedAt") ? dayField(formData.get("grantedAt")) : undefined,
    quantity: formData.get("quantity") ? Number(formData.get("quantity")) : undefined,
    expiresAt: formData.get("expiresAt") ? dayField(formData.get("expiresAt")) : undefined,
  });
  revalidatePath(`/subscriptions/${subscriptionId}`);
  redirect(`/subscriptions/${subscriptionId}`);
}

export async function deletePackAction(subscriptionId: string, packId: string) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  await deletePack(user.id, packId);
  revalidatePath(`/subscriptions/${subscriptionId}`);
  redirect(`/subscriptions/${subscriptionId}`);
}


/** 省钱型：录入已省金额（amount 增量或 cumulative 平台累计值，二选一） */
export async function addSavingsAction(subscriptionId: string, formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const amount = formData.get("amount");
  const cumulative = formData.get("cumulative");
  await addSavings(user.id, subscriptionId, user.id, {
    date: dayField(formData.get("date")),
    amount: amount && String(amount).trim() !== "" ? Number(amount) : undefined,
    cumulative: cumulative && String(cumulative).trim() !== "" ? Number(cumulative) : undefined,
  });
  revalidatePath(`/subscriptions/${subscriptionId}`);
  const back = formData.get("back");
  redirect(back ? `/subscriptions/${subscriptionId}/usage/records?${back}` : `/subscriptions/${subscriptionId}`);
}

export async function deleteUsageAction(subscriptionId: string, usageId: string, back?: string) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  await deleteUsage(user.id, usageId);
  revalidatePath(`/subscriptions/${subscriptionId}`);
  redirect(back ? `/subscriptions/${subscriptionId}/usage/records?${back}` : `/subscriptions/${subscriptionId}`);
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

export async function updateUsageAction(subscriptionId: string, usageId: string, formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const num = (k: string) => {
    const v = formData.get(k);
    return v && String(v).trim() !== "" ? Number(v) : undefined;
  };
  await updateUsage(user.id, usageId, {
    date: formData.get("date") ? dayField(formData.get("date")) : undefined,
    quantity: num("quantity"),
    unitPrice: num("unitPrice"),
    quotaTotal: num("quotaTotal"),
  });
  revalidatePath(`/subscriptions/${subscriptionId}/usage/records`);
  revalidatePath(`/subscriptions/${subscriptionId}`);
  redirect(`/subscriptions/${subscriptionId}/usage/records?${formData.get("back") ?? ""}`);
}
