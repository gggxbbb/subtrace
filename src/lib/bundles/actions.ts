"use server";

import { redirect } from "next/navigation";
import { getCurrentUser } from "../auth/session";
import { createBundle, type BundleItemInput } from "./service";

const parseDate = (v: FormDataEntryValue | null) => new Date(`${String(v)}T00:00:00Z`);

export async function createBundleAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const itemsRaw = String(formData.get("items") ?? "[]");
  let items: BundleItemInput[];
  try {
    const parsed = JSON.parse(itemsRaw) as {
      subscriptionId?: string;
      newName?: string;
      listPriceBase: number | null;
      allocatedBase?: number;
      periodStart?: string;
      periodEnd?: string;
    }[];
    const periodStart = parseDate(formData.get("periodStart"));
    const periodEnd = parseDate(formData.get("periodEnd"));
    items = parsed.map((it) => ({
      subscriptionId: it.subscriptionId || undefined,
      newSubscription: it.newName ? { name: it.newName } : undefined,
      listPriceBase: it.listPriceBase,
      allocatedBase: it.allocatedBase,
      periodStart: it.periodStart ? new Date(`${it.periodStart}T00:00:00Z`) : periodStart,
      periodEnd: it.periodEnd ? new Date(`${it.periodEnd}T00:00:00Z`) : periodEnd,
    }));
    await createBundle(user.id, {
      name: String(formData.get("name") ?? ""),
      totalAmount: Number(formData.get("totalAmount")),
      currency: String(formData.get("currency") ?? "CNY"),
      totalAmountBase: Number(formData.get("totalAmountBase") ?? formData.get("totalAmount")),
      periodStart,
      periodEnd,
      items,
    });
  } catch {
    redirect("/bundles/new?error=1");
  }
  redirect("/bundles");
}
