"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "../auth/session";
import {
  createSubscription,
  deletePayment,
  deleteSubscription,
  recordPayment,
  applyRechain,
  setStatus,
  toEngineSub,
  updateSubscription,
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

/** "7,3,0" → [7,3,0]；空串 → []（关闭提醒）；非法项丢弃 */
const parseRemindDaysField = (v: FormDataEntryValue | null): number[] | undefined => {
  if (v === null) return undefined;
  const days = String(v)
    .split(/[\s,，、/]+/)
    .filter((t) => t !== "")
    .map(Number)
    .filter((n) => Number.isInteger(n) && n >= 0);
  return [...new Set(days)];
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
    remindDays: parseRemindDaysField(formData.get("remindDays")),
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

  // 金额留空 = 金额未知（ticket 12）：只记服务区间，成本不计
  const amount = parseNum(formData.get("amount")) ?? null;
  const input: PaymentInput = {
    amount,
    currency: amount === null ? null : String(formData.get("currency") ?? "") || null,
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
  const back = formData.get("back");
  const sep = back ? "&" : "";
  redirect(back ? `/subscriptions/${subscriptionId}/payments?${back}${sep}rechain=1` : `/subscriptions/${subscriptionId}?rechain=1`);
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
  const amount = parseNum(formData.get("amount")) ?? null;
  return {
    amount,
    currency: amount === null ? null : String(formData.get("currency") ?? "") || null,
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
  const back = formData.get("back");
  const sep = back ? "&" : "";
  redirect(back ? `/subscriptions/${subscriptionId}/payments?${back}${sep}rechain=1` : `/subscriptions/${subscriptionId}?rechain=1`);
}

export async function deletePaymentAction(subscriptionId: string, paymentId: string, back?: string) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  await deletePayment(user.id, paymentId);
  revalidatePath(`/subscriptions/${subscriptionId}`);
  revalidatePath("/dashboard");
  const sep = back ? "&" : "";
  redirect(back ? `/subscriptions/${subscriptionId}/payments?${back}${sep}rechain=1` : `/subscriptions/${subscriptionId}?rechain=1`);
}

export async function deleteSubscriptionAction(subscriptionId: string) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  await deleteSubscription(user.id, subscriptionId);
  revalidatePath("/subscriptions");
  revalidatePath("/dashboard");
  redirect("/subscriptions");
}

export async function updateSubscriptionAction(subscriptionId: string, formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  await updateSubscription(user.id, subscriptionId, {
    name: String(formData.get("name") ?? ""),
    category: String(formData.get("category") ?? ""),
    cycleKind: (String(formData.get("cycleKind") ?? "") || undefined) as "CALENDAR" | "FIXED_DAYS" | undefined,
    cycleUnit: (String(formData.get("cycleUnit") ?? "") || undefined) as "DAY" | "WEEK" | "MONTH" | "YEAR" | undefined,
    cycleCount: parseNum(formData.get("cycleCount")),
    fixedDays: parseNum(formData.get("fixedDays")),
    listPriceBase: parseNum(formData.get("listPriceBase")),
    listCurrency: String(formData.get("listCurrency") ?? "") || undefined,
    autoRenew: formData.get("autoRenew") !== null,
    remindDays: parseRemindDaysField(formData.get("remindDays")),
    startDate: parseDate(formData.get("startDate")),
  });
  revalidatePath(`/subscriptions/${subscriptionId}`);
  revalidatePath("/subscriptions");
  revalidatePath("/dashboard");
  redirect(`/subscriptions/${subscriptionId}`);
}

/** 确认链式重排：后续记录平移保持连续 */
export async function rechainPaymentsAction(subscriptionId: string, back?: string) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  await applyRechain(user.id, subscriptionId);
  revalidatePath(`/subscriptions/${subscriptionId}`);
  revalidatePath("/dashboard");
  redirect(back ? `/subscriptions/${subscriptionId}/payments?${back}` : `/subscriptions/${subscriptionId}`);
}
