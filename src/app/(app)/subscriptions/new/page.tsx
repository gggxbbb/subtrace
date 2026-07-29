import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getCurrentUser } from "@/lib/auth/session";
import { NewSubscriptionWizard } from "./Wizard";

export default async function NewSubscriptionPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return (
    <Suspense>
      <NewSubscriptionWizard baseCurrency={user.baseCurrency} />
    </Suspense>
  );
}
