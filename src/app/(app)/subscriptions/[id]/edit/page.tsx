import { notFound, redirect } from "next/navigation";
import { isoDay } from "@/lib/dates";
import { getCurrentUser } from "@/lib/auth/session";
import { getSubscription } from "@/lib/subscriptions/service";
import { parseRemindDays } from "@/lib/reminders";
import { updateSubscriptionAction } from "@/lib/subscriptions/actions";
import { SubscriptionEditForm } from "./SubscriptionEditForm";
import { ErrorBanner } from "@/components/te";

export const dynamic = "force-dynamic";

export default async function EditSubscriptionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { id } = await params;
  const { error } = await searchParams;
  const sub = await getSubscription(user.id, id);
  if (!sub) notFound();
  if (sub.ownerId !== user.id) redirect(`/subscriptions/${id}`);

  return (
    <>
      <header className="flex h-16 items-center border-b border-ink bg-base px-4 md:px-6">
        <div>
          <div className="text-[9px] uppercase tracking-[0.25em] text-neutral-500 f-mono">
            subscriptions / {sub.name} / edit
          </div>
          <h1 className="text-xl font-bold uppercase tracking-tight">编辑订阅</h1>
        </div>
      </header>
      <main className="mx-auto max-w-xl px-4 py-8 md:px-6">
        <ErrorBanner error={error ?? null} defaultMessage="保存失败：请检查必填项" className="mb-4" />
        <SubscriptionEditForm
          subscriptionId={sub.id}
          action={updateSubscriptionAction.bind(null, sub.id)}
          initial={{
            name: sub.name,
            category: sub.category,
            trackingMode: sub.trackingMode as "CYCLE" | "MANUAL",
            cycleKind: (sub.cycleKind as "CALENDAR" | "FIXED_DAYS" | null) ?? "CALENDAR",
            cycleUnit: (sub.cycleUnit as "DAY" | "WEEK" | "MONTH" | "YEAR" | null) ?? "MONTH",
            cycleCount: sub.cycleCount ?? 1,
            fixedDays: sub.fixedDays,
            listPrice: sub.listPrice,
            listPriceBase: sub.listPriceBase,
            listCurrency: sub.listCurrency ?? "CNY",
            autoRenew: sub.autoRenew,
            remindDays: parseRemindDays(sub.remindDays).join(","),
            startDate: isoDay(sub.startDate),
          }}
        />
        <p className="mt-3 text-[10px] text-neutral-400 f-mono">
          跟踪模式（周期/手动）不可切换——建错了请归档后重建。改周期字段只影响之后的推算，不改写付费记录。
        </p>
      </main>
    </>
  );
}
