import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getSubscription } from "@/lib/subscriptions/service";
import { prisma } from "@/lib/db";
import { UsageWizard } from "./UsageWizard";

export const dynamic = "force-dynamic";

export default async function UsageWizardPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { id } = await params;
  const [sub, recordCount] = await Promise.all([
    getSubscription(user.id, id),
    prisma.usageRecord.count({ where: { subscriptionId: id } }),
  ]);
  if (!sub) notFound();

  return (
    <>
      <header className="flex h-16 items-center border-b border-black bg-[#E4E3E0] px-4 md:px-6">
        <div>
          <div className="text-[9px] uppercase tracking-[0.25em] text-neutral-500 f-mono">
            subscriptions / {sub.name} / usage
          </div>
          <h1 className="text-xl font-bold uppercase tracking-tight">用量跟踪向导</h1>
        </div>
      </header>
      <main className="mx-auto max-w-2xl space-y-4 p-6">
        <UsageWizard
          subscriptionId={sub.id}
          initialKind={(sub.usageKind as "COUNT" | "QUOTA" | null) ?? null}
          initialUnit={sub.usageUnit}
          initialAltUnitPrice={sub.altUnitPrice}
          initialQuotaTotal={sub.quotaTotal}
          recordCount={recordCount}
          currency={user.baseCurrency}
        />
      </main>
    </>
  );
}
