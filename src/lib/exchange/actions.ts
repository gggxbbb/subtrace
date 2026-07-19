"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "../auth/session";
import {
  deleteRate,
  getRate,
  refreshAutoRates,
  setBaseCurrency,
  setRatesApiUrl,
  upsertRate,
} from "./service";

const PATH = "/settings/rates";

const assertUser = async () => {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
};

export async function setBaseCurrencyAction(formData: FormData) {
  const user = await assertUser();
  try {
    await setBaseCurrency(user.id, String(formData.get("baseCurrency") ?? ""));
  } catch {
    redirect(`${PATH}?error=1`);
  }
  revalidatePath(PATH);
  redirect(PATH);
}

export async function setRatesApiUrlAction(formData: FormData) {
  const user = await assertUser();
  try {
    await setRatesApiUrl(user.id, String(formData.get("ratesApiUrl") ?? ""));
  } catch {
    redirect(`${PATH}?error=1`);
  }
  revalidatePath(PATH);
  redirect(PATH);
}

export async function upsertRateAction(formData: FormData) {
  const user = await assertUser();
  try {
    await upsertRate(user.id, {
      currency: String(formData.get("currency") ?? ""),
      rateToBase: Number(formData.get("rateToBase")),
      mode: String(formData.get("mode")) === "AUTO" ? "AUTO" : "MANUAL",
    });
  } catch {
    redirect(`${PATH}?error=1`);
  }
  revalidatePath(PATH);
  redirect(PATH);
}

export async function deleteRateAction(rateId: string) {
  const user = await assertUser();
  await deleteRate(user.id, rateId);
  revalidatePath(PATH);
}

/** 立即刷新 AUTO 汇率；返回摘要给客户端展示 */
export async function refreshRatesAction(): Promise<{ updated: number; failed: { currency: string; error: string }[] }> {
  const user = await assertUser();
  const summary = await refreshAutoRates(user.id);
  revalidatePath(PATH);
  return summary;
}

/** 录入表单预填：查 1 原币 = N 主币种 */
export async function lookupRateAction(currency: string): Promise<number | null> {
  const user = await assertUser();
  return getRate(user.id, currency);
}
