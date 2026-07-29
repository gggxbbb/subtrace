import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { PurchaseNewForm } from "./PurchaseNewForm";

export default async function NewPurchasePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { error } = await searchParams;
  return <PurchaseNewForm baseCurrency={user.baseCurrency} error={error ?? null} />;
}
