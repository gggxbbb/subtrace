import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { getCurrentUser } from "@/lib/auth/session";
import { getSubscription } from "@/lib/subscriptions/service";
import { prisma } from "@/lib/db";
import { isoDay } from "@/lib/dates";
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
      <PageHeader
        crumb={<>subscriptions / {sub.name} / usage</>}
        title={<>用量跟踪向导</>}
      />
      <main className="mx-auto max-w-2xl space-y-4 p-6">
        <UsageWizard
          subscriptionId={sub.id}
          initialKind={(sub.usageKind as "COUNT" | "QUOTA" | "SAVINGS" | null) ?? null}
          initialGrantMode={(sub.grantMode as "RESET" | "STACKED" | null) ?? null}
          initialPackValidMonths={sub.packValidMonths}
          initialUnit={sub.usageUnit}
          initialAltUnitPrice={sub.altUnitPrice}
          initialQuotaTotal={sub.quotaTotal}
          initialUsageCycleUnit={(sub.usageCycleUnit as "DAY" | "WEEK" | "MONTH" | "YEAR" | null) ?? null}
          initialUsageCycleCount={sub.usageCycleCount}
          initialUsageCycleAnchor={sub.usageCycleAnchor ? isoDay(sub.usageCycleAnchor) : null}
          trackingMode={sub.trackingMode}
          recordCount={recordCount}
          currency={user.baseCurrency}
        />
      </main>
    </>
  );
}
