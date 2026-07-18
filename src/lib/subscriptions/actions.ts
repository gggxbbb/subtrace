"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "../auth/session";
import {
  createSubscription,
  recordPayment,
  setStatus,
  type PaymentInput,
  type SubscriptionInput,
} from "./service";

const parseDate = (v: FormDataEntryValue | null) =>
  new Date(`${String(v)}T00:00:00Z`);

const parseNum = (v: FormDataEntryValue | null) => {
  const n = Number(v);
  return Number.isFinite(n) && String(v).trim() !== "" ? n : undefined;
};

export async function createSubscriptionAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const trackingMode = String(formData.get("trackingMode")) as "CYCLE" | "MANUAL";
  const cycleKind = String(formData.get("cycleKind") ?? "") || undefined;
  const input: SubscriptionInput = {
    name: String(formData.get("name") ?? ""),
    category: String(formData.get("category") ?? "") || undefined,
    trackingMode,
    cycleKind: cycleKind as "CALENDAR" | "FIXED_DAYS" | undefined,
    cycleUnit: (String(formData.get("cycleUnit") ?? "") || undefined) as
      | "DAY"
      | "WEEK"
      | "MONTH"
      | "YEAR"
      | undefined,
    cycleCount: parseNum(formData.get("cycleCount")),
    fixedDays: parseNum(formData.get("fixedDays")),
    listPrice: parseNum(formData.get("listPrice")),
    listCurrency: String(formData.get("listCurrency") ?? "") || undefined,
    listPriceBase: parseNum(formData.get("listPriceBase")),
    autoRenew: formData.get("autoRenew") !== null,
    startDate: parseDate(formData.get("startDate")),
  };
  if (!input.name.trim()) redirect("/subscriptions/new?error=1");
  let createdId: string;
  try {
    createdId = (await createSubscription(user.id, input)).id;
  } catch {
    redirect("/subscriptions/new?error=1");
  }
  redirect(`/subscriptions/${createdId}`);
}

export async function recordPaymentAction(subscriptionId: string, formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const amount = Number(formData.get("amount"));
  const input: PaymentInput = {
    amount,
    currency: String(formData.get("currency") ?? "CNY"),
    amountBase: parseNum(formData.get("amountBase")) ?? amount,
    refundedBase: parseNum(formData.get("refundedBase")) ?? 0,
    paidAt: parseDate(formData.get("paidAt")),
    periodStart: parseDate(formData.get("periodStart")),
    periodEnd: parseDate(formData.get("periodEnd")),
    source: String(formData.get("source") ?? "MANUAL") as PaymentInput["source"],
    note: String(formData.get("note") ?? "") || undefined,
  };
  try {
    await recordPayment(user.id, subscriptionId, input);
  } catch {
    redirect(`/subscriptions/${subscriptionId}?error=1`);
  }
  revalidatePath(`/subscriptions/${subscriptionId}`);
  revalidatePath("/dashboard");
  redirect(`/subscriptions/${subscriptionId}`);
}

export async function setStatusAction(
  subscriptionId: string,
  status: "ACTIVE" | "CANCELLED" | "ARCHIVED",
) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  await setStatus(user.id, subscriptionId, status);
  revalidatePath("/subscriptions");
  revalidatePath("/dashboard");
  redirect("/subscriptions");
}
