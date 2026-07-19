"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "../auth/session";
import {
  createSubscription,
  deletePayment,
  deleteSubscription,
  recordPayment,
  setStatus,
  toEngineSub,
  updatePayment,
  type PaymentInput,
  type SubscriptionInput,
} from "./service";
import { advanceCycle } from "../cost-engine";

const parseDate = (v: FormDataEntryValue | null) =>
  new Date(`${String(v)}T00:00:00Z`);

const parseNum = (v: FormDataEntryValue | null) => {
  if (v == null || String(v).trim() === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
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
    const created = await createSubscription(user.id, input);
    createdId = created.id;
    // 同时记一笔付费（推荐路径）：到期日与成本立即以实付为准
    if (formData.get("firstPayment") !== null) {
      const amount = parseNum(formData.get("firstAmount")) ?? input.listPriceBase ?? input.listPrice;
      const periodStart = formData.get("firstPeriodStart")
        ? parseDate(formData.get("firstPeriodStart"))
        : input.startDate;
      let periodEnd = formData.get("firstPeriodEnd")
        ? parseDate(formData.get("firstPeriodEnd"))
        : null;
      if (!periodEnd && created.trackingMode === "CYCLE") {
        const cycle = toEngineSub(created).cycle;
        if (cycle) periodEnd = advanceCycle(periodStart, cycle, 1);
      }
      if (amount != null && periodEnd) {
        await recordPayment(user.id, createdId, {
          amount,
          currency: input.listCurrency ?? "CNY",
          amountBase: amount,
          paidAt: formData.get("firstPaidAt") ? parseDate(formData.get("firstPaidAt")) : input.startDate,
          periodStart,
          periodEnd,
          source: (String(formData.get("firstSource")) || "AUTO") as PaymentInput["source"],
        });
      }
    }
  } catch (e) {
    if (e instanceof Error && e.message.includes("NEXT_REDIRECT")) throw e;
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

const paymentInputFrom = (formData: FormData): PaymentInput => {
  const amount = Number(formData.get("amount"));
  return {
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
};

export async function updatePaymentAction(
  subscriptionId: string,
  paymentId: string,
  formData: FormData,
) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  await updatePayment(user.id, paymentId, paymentInputFrom(formData));
  revalidatePath(`/subscriptions/${subscriptionId}`);
  revalidatePath("/dashboard");
  redirect(`/subscriptions/${subscriptionId}`);
}

export async function deletePaymentAction(subscriptionId: string, paymentId: string) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  await deletePayment(user.id, paymentId);
  revalidatePath(`/subscriptions/${subscriptionId}`);
  revalidatePath("/dashboard");
  redirect(`/subscriptions/${subscriptionId}`);
}

export async function deleteSubscriptionAction(subscriptionId: string) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  await deleteSubscription(user.id, subscriptionId);
  revalidatePath("/subscriptions");
  revalidatePath("/dashboard");
  redirect("/subscriptions");
}
