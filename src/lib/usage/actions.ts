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

const parseDate = (v: FormDataEntryValue | null) => new Date(`${String(v)}T00:00:00Z`);

export async function setUsageConfigAction(subscriptionId: string, formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  await setUsageConfig(user.id, subscriptionId, {
    usageKind: String(formData.get("usageKind")) as "COUNT" | "QUOTA",
    usageUnit: String(formData.get("usageUnit") ?? ""),
    altUnitPrice: Number(formData.get("altUnitPrice")),
    quotaTotal: formData.get("quotaTotal") ? Number(formData.get("quotaTotal")) : undefined,
  });
  revalidatePath(`/subscriptions/${subscriptionId}`);
  redirect(`/subscriptions/${subscriptionId}`);
}

export async function addUsageAction(subscriptionId: string, formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  await addUsage(user.id, subscriptionId, user.id, {
    date: parseDate(formData.get("date")),
    quantity: Number(formData.get("quantity")),
  });
  revalidatePath(`/subscriptions/${subscriptionId}`);
  redirect(`/subscriptions/${subscriptionId}`);
}

export async function addQuotaSnapshotAction(subscriptionId: string, formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const percent = formData.get("percent");
  const used = formData.get("used");
  await addQuotaSnapshot(user.id, subscriptionId, user.id, {
    date: parseDate(formData.get("date")),
    percent: percent && String(percent).trim() !== "" ? Number(percent) : undefined,
    used: used && String(used).trim() !== "" ? Number(used) : undefined,
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
