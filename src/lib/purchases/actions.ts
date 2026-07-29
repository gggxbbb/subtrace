"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "../auth/session";
import { NoRateError, resolveMoney } from "../money";
import {
  addPurchaseEvent,
  addPurchaseIncome,
  deletePurchaseEvent,
  updatePurchaseEvent,
  closePurchase,
  createPurchase,
  deletePurchase,
  deletePurchaseIncome,
  setPurchaseArchived,
  updatePurchaseIncome,
  updatePurchase,
  type PurchaseInput,
} from "./service";

const parseDate = (v: FormDataEntryValue | null) => new Date(`${String(v)}T00:00:00+08:00`);

const parseNum = (v: FormDataEntryValue | null) => {
  if (v == null || String(v).trim() === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

export async function createPurchaseAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  let createdId: string;
  try {
    const money = await resolveMoney(formData, user);
    const input: PurchaseInput = {
      name: String(formData.get("name") ?? ""),
      category: String(formData.get("category") ?? "") || undefined,
      amount: money.amount!,
      currency: money.currency!,
      amountBase: money.amountBase!,
      purchaseDate: parseDate(formData.get("purchaseDate")),
      expectedDays: parseNum(formData.get("expectedDays")),
    };
    if (!input.name.trim()) redirect("/purchases/new?error=1");
    createdId = (await createPurchase(user.id, input)).id;
  } catch (e) {
    if (e instanceof Error && e.message.includes("NEXT_REDIRECT")) throw e;
    if (e instanceof NoRateError) redirect("/purchases/new?error=fx");
    redirect("/purchases/new?error=1");
  }
  redirect(`/purchases/${createdId}`);
}

export async function closePurchaseAction(purchaseId: string, formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const status = String(formData.get("status")) as "SOLD" | "RETIRED";
  await closePurchase(user.id, purchaseId, {
    status,
    endDate: parseDate(formData.get("endDate")),
    resaleBase: parseNum(formData.get("resaleBase")),
  });
  revalidatePath("/purchases");
  revalidatePath("/dashboard");
  redirect("/purchases");
}

export async function updatePurchaseAction(purchaseId: string, formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  try {
    const money = await resolveMoney(formData, user);
    await updatePurchase(user.id, purchaseId, {
      name: String(formData.get("name") ?? ""),
      category: String(formData.get("category") ?? ""),
      amount: money.amount!,
      currency: money.currency ?? "CNY",
      amountBase: money.amountBase!,
      purchaseDate: parseDate(formData.get("purchaseDate")),
      expectedDays: parseNum(formData.get("expectedDays")),
    });
  } catch (e) {
    if (e instanceof NoRateError) redirect(`/purchases/${purchaseId}/edit?error=fx`);
    redirect(`/purchases/${purchaseId}/edit?error=1`);
  }
  revalidatePath(`/purchases/${purchaseId}`);
  revalidatePath("/purchases");
  redirect(`/purchases/${purchaseId}`);
}

export async function addPurchaseIncomeAction(purchaseId: string, formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const back = formData.get("back");
  const sep = back ? "&" : "";
  try {
    const money = await resolveMoney(formData, user);
    await addPurchaseIncome(user.id, purchaseId, {
      amount: money.amount!,
      currency: money.currency!,
      amountBase: money.amountBase!,
      date: parseDate(formData.get("date")),
      note: String(formData.get("note") ?? "") || undefined,
    });
  } catch (e) {
    if (e instanceof NoRateError) redirect(`/purchases/${purchaseId}/incomes?error=fx${sep}${back ?? ""}`);
    redirect(`/purchases/${purchaseId}/incomes?error=1${sep}${back ?? ""}`);
  }
  revalidatePath(`/purchases/${purchaseId}`);
  redirect(back ? `/purchases/${purchaseId}/incomes?${back}` : `/purchases/${purchaseId}`);
}

export async function deletePurchaseIncomeAction(purchaseId: string, incomeId: string, back?: string) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  await deletePurchaseIncome(user.id, incomeId);
  revalidatePath(`/purchases/${purchaseId}`);
  redirect(back ? `/purchases/${purchaseId}/incomes?${back}` : `/purchases/${purchaseId}`);
}

export async function setPurchaseArchivedAction(purchaseId: string, archived: boolean) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  await setPurchaseArchived(user.id, purchaseId, archived);
  revalidatePath("/purchases");
  revalidatePath("/dashboard");
  redirect("/purchases");
}

export async function deletePurchaseAction(purchaseId: string) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  await deletePurchase(user.id, purchaseId);
  revalidatePath("/purchases");
  revalidatePath("/dashboard");
  redirect("/purchases");
}

export async function updatePurchaseIncomeAction(purchaseId: string, incomeId: string, formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  try {
    const money = await resolveMoney(formData, user);
    await updatePurchaseIncome(user.id, incomeId, {
      amount: money.amount!,
      currency: money.currency!,
      amountBase: money.amountBase!,
      date: parseDate(formData.get("date")),
      note: String(formData.get("note") ?? "") || null,
    });
  } catch (e) {
    if (e instanceof NoRateError) redirect(`/purchases/${purchaseId}/incomes?error=fx`);
    redirect(`/purchases/${purchaseId}/incomes?error=1`);
  }
  revalidatePath(`/purchases/${purchaseId}`);
  redirect(`/purchases/${purchaseId}/incomes?${formData.get("back") ?? ""}`);
}

export async function addPurchaseEventAction(purchaseId: string, formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  try {
    const money = await resolveMoney(formData, user);
    await addPurchaseEvent(user.id, purchaseId, {
      kind: String(formData.get("kind") ?? "OTHER") as "ACCESSORY" | "REPAIR" | "OTHER",
      amount: money.amount!,
      currency: money.currency!,
      amountBase: money.amountBase!,
      date: parseDate(formData.get("date")),
      extendDays: parseNum(formData.get("extendDays")),
      note: String(formData.get("note") ?? "") || undefined,
    });
  } catch (e) {
    if (e instanceof NoRateError) redirect(`/purchases/${purchaseId}?error=fx`);
    redirect(`/purchases/${purchaseId}?error=1`);
  }
  revalidatePath(`/purchases/${purchaseId}`);
  revalidatePath("/purchases");
  revalidatePath("/dashboard");
  redirect(`/purchases/${purchaseId}`);
}

export async function updatePurchaseEventAction(purchaseId: string, eventId: string, formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  try {
    const money = await resolveMoney(formData, user);
    await updatePurchaseEvent(user.id, eventId, {
      kind: String(formData.get("kind") ?? "OTHER") as "ACCESSORY" | "REPAIR" | "OTHER",
      amount: money.amount!,
      amountBase: money.amountBase!,
      date: parseDate(formData.get("date")),
      extendDays: parseNum(formData.get("extendDays")) ?? null,
      note: String(formData.get("note") ?? "") || null,
    });
  } catch (e) {
    if (e instanceof NoRateError) redirect(`/purchases/${purchaseId}?error=fx`);
    redirect(`/purchases/${purchaseId}?error=1`);
  }
  revalidatePath(`/purchases/${purchaseId}`);
  revalidatePath("/purchases");
  revalidatePath("/dashboard");
  redirect(`/purchases/${purchaseId}`);
}

export async function deletePurchaseEventAction(purchaseId: string, eventId: string) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  await deletePurchaseEvent(user.id, eventId);
  revalidatePath(`/purchases/${purchaseId}`);
  revalidatePath("/purchases");
  revalidatePath("/dashboard");
  redirect(`/purchases/${purchaseId}`);
}
