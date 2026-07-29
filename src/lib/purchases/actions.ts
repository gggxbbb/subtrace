"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "../auth/session";
import { NoRateError, resolveMoney } from "../money";
import { dayField, numField } from "../form";
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
  updatePurchase
} from "./service";



export async function createPurchaseAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!String(formData.get("name") ?? "").trim()) redirect("/purchases/new?error=1");
  let createdId: string;
  try {
    const money = await resolveMoney(formData, user);
    createdId = (await createPurchase(user.id, {
      name: String(formData.get("name") ?? ""),
      category: String(formData.get("category") ?? "") || undefined,
      amount: money.amount!,
      currency: money.currency!,
      amountBase: money.amountBase!,
      purchaseDate: dayField(formData.get("purchaseDate")),
      expectedDays: numField(formData.get("expectedDays")),
    })).id;
  } catch (e) {
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
    endDate: dayField(formData.get("endDate")),
    resaleBase: numField(formData.get("resaleBase")),
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
      purchaseDate: dayField(formData.get("purchaseDate")),
      expectedDays: numField(formData.get("expectedDays")),
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
    const money = await resolveMoney(formData, user, { requirePositive: true });
    await addPurchaseIncome(user.id, purchaseId, {
      amount: money.amount!,
      currency: money.currency!,
      amountBase: money.amountBase!,
      date: dayField(formData.get("date")),
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
    const money = await resolveMoney(formData, user, { requirePositive: true });
    await updatePurchaseIncome(user.id, incomeId, {
      amount: money.amount!,
      currency: money.currency!,
      amountBase: money.amountBase!,
      date: dayField(formData.get("date")),
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
    const money = await resolveMoney(formData, user, { requirePositive: true });
    await addPurchaseEvent(user.id, purchaseId, {
      kind: String(formData.get("kind") ?? "OTHER") as "ACCESSORY" | "REPAIR" | "OTHER",
      amount: money.amount!,
      currency: money.currency!,
      amountBase: money.amountBase!,
      date: dayField(formData.get("date")),
      extendDays: numField(formData.get("extendDays")),
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
    const money = await resolveMoney(formData, user, { requirePositive: true });
    await updatePurchaseEvent(user.id, eventId, {
      kind: String(formData.get("kind") ?? "OTHER") as "ACCESSORY" | "REPAIR" | "OTHER",
      amount: money.amount!,
      amountBase: money.amountBase!,
      date: dayField(formData.get("date")),
      extendDays: numField(formData.get("extendDays")) ?? null,
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
