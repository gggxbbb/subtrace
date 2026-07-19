"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "../auth/session";
import { closePurchase, createPurchase, type PurchaseInput } from "./service";

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
