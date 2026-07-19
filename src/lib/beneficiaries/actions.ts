"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "../auth/session";
import { addBeneficiary, removeBeneficiary, setBeneficiaryWeight } from "./service";

export async function addBeneficiaryAction(subscriptionId: string, formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const kind = String(formData.get("kind")) as "USER" | "ITEM";
  const refId = String(formData.get("refId") ?? "");
  const weight = Number(formData.get("weight") ?? 1);
  if (!refId) return;
  await addBeneficiary(user.id, subscriptionId, {
    kind,
    userId: kind === "USER" ? refId : undefined,
    purchaseId: kind === "ITEM" ? refId : undefined,
    weight: weight > 0 ? weight : 1,
  });
  revalidatePath(`/subscriptions/${subscriptionId}`);
  redirect(`/subscriptions/${subscriptionId}`);
}

export async function removeBeneficiaryAction(subscriptionId: string, beneficiaryId: string) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  await removeBeneficiary(user.id, beneficiaryId);
  revalidatePath(`/subscriptions/${subscriptionId}`);
  redirect(`/subscriptions/${subscriptionId}`);
}

export async function setBeneficiaryWeightAction(
  subscriptionId: string,
  beneficiaryId: string,
  formData: FormData,
) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const weight = Number(formData.get("weight"));
  if (!(weight > 0)) return;
  await setBeneficiaryWeight(user.id, beneficiaryId, weight);
  revalidatePath(`/subscriptions/${subscriptionId}`);
  redirect(`/subscriptions/${subscriptionId}`);
}
