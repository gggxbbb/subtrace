"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "../auth/session";
import {
  addPurchaseIncome,
  closePurchase,
  createPurchase,
  deletePurchaseIncome,
  updatePurchase,
  type PurchaseInput,
} from "./service";

const parseDate = (v: FormDataEntryValue | null) => new Date(`${String(v)}T00:00:00Z`);

const parseNum = (v: FormDataEntryValue | null) => {
  if (v == null || String(v).trim() === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

export async function createPurchaseAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const amount = Number(formData.get("amount"));
  const input: PurchaseInput = {
    name: String(formData.get("name") ?? ""),
    category: String(formData.get("category") ?? "") || undefined,
    amount,
    currency: String(formData.get("currency") ?? "CNY"),
    amountBase: parseNum(formData.get("amountBase")) ?? amount,
    purchaseDate: parseDate(formData.get("purchaseDate")),
    expectedDays: parseNum(formData.get("expectedDays")),
  };
  if (!input.name.trim() || !Number.isFinite(amount)) redirect("/purchases/new?error=1");
  let createdId: string;
  try {
    createdId = (await createPurchase(user.id, input)).id;
  } catch {
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
  const amount = parseNum(formData.get("amount"));
  await updatePurchase(user.id, purchaseId, {
    name: String(formData.get("name") ?? ""),
    category: String(formData.get("category") ?? ""),
    amount,
    currency: String(formData.get("currency") ?? "CNY"),
    amountBase: parseNum(formData.get("amountBase")) ?? amount,
    purchaseDate: parseDate(formData.get("purchaseDate")),
    expectedDays: parseNum(formData.get("expectedDays")),
  });
  revalidatePath(`/purchases/${purchaseId}`);
  revalidatePath("/purchases");
  redirect(`/purchases/${purchaseId}`);
}

export async function addPurchaseIncomeAction(purchaseId: string, formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const amount = Number(formData.get("amount"));
  if (!Number.isFinite(amount) || amount <= 0) redirect(`/purchases/${purchaseId}`);
  await addPurchaseIncome(user.id, purchaseId, {
    amount,
    currency: String(formData.get("currency") ?? "CNY"),
    amountBase: parseNum(formData.get("amountBase")) ?? amount,
    date: parseDate(formData.get("date")),
    note: String(formData.get("note") ?? "") || undefined,
  });
  revalidatePath(`/purchases/${purchaseId}`);
  redirect(`/purchases/${purchaseId}`);
}

export async function deletePurchaseIncomeAction(purchaseId: string, incomeId: string) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  await deletePurchaseIncome(user.id, incomeId);
  revalidatePath(`/purchases/${purchaseId}`);
  redirect(`/purchases/${purchaseId}`);
}
