import { notFound, redirect } from "next/navigation";
import { isoDay } from "@/lib/dates";
import { getCurrentUser } from "@/lib/auth/session";
import { getSubscription } from "@/lib/subscriptions/service";
import { listUsage } from "@/lib/usage/service";
import { UsageRecordsManager, type UsageRow } from "./UsageRecordsManager";

export const dynamic = "force-dynamic";

export default async function UsageRecordsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ userId?: string; kind?: string; from?: string; to?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { id } = await params;
  const sp = await searchParams;
  const [sub, all] = await Promise.all([getSubscription(user.id, id), listUsage(id)]);
  if (!sub) notFound();
  if (!sub.usageKind) redirect(`/subscriptions/${id}/usage`);

  const from = sp.from ? new Date(`${sp.from}T00:00:00+08:00`) : null;
  const to = sp.to ? new Date(`${sp.to}T00:00:00+08:00`) : null;

  // 用户名映射：所有者 + USER 受益人
  const names = new Map<string, string>();
  names.set(sub.ownerId, sub.owner.username);
  for (const b of sub.beneficiaries) if (b.user) names.set(b.user.id, b.user.username);

  let rows: UsageRow[] = all.map((r) => ({
    id: r.id,
    userId: r.userId,
    userName: names.get(r.userId) ?? r.userId,
    date: isoDay(r.date),
    quantity: r.quantity,
    kind: r.kind,
    unitPrice: r.unitPrice,
    quotaTotal: r.quotaTotal,
  }));
  if (sp.userId) rows = rows.filter((r) => r.userId === sp.userId);
  if (sp.kind) rows = rows.filter((r) => r.kind === sp.kind);
  if (from) rows = rows.filter((r) => new Date(`${r.date}T00:00:00+08:00`) >= from);
  if (to) rows = rows.filter((r) => new Date(`${r.date}T00:00:00+08:00`) <= to);
  rows = rows.reverse();

  const back = new URLSearchParams(
    Object.entries({ userId: sp.userId, kind: sp.kind, from: sp.from, to: sp.to }).filter(([, v]) => v) as [string, string][],
  ).toString();

  return (
    <>
      <header className="flex h-16 items-center justify-between border-b border-black bg-[#E4E3E0] px-4 md:px-6">
        <div>
          <div className="text-[9px] uppercase tracking-[0.25em] text-neutral-500 f-mono">
            subscriptions / {sub.name} / usage records
          </div>
          <h1 className="text-xl font-bold uppercase tracking-tight">用量记录管理</h1>
        </div>
        <a
          href={`/subscriptions/${sub.id}`}
          className="border border-black bg-white px-3 py-2 text-[10px] uppercase tracking-wider f-mono hover:bg-black hover:text-white"
        >
          ← 返回订阅
        </a>
      </header>
      <main className="mx-auto max-w-3xl space-y-4 p-6">
        <UsageRecordsManager
          subscriptionId={sub.id}
          usageKind={sub.usageKind as "COUNT" | "QUOTA"}
          usageUnit={sub.usageUnit}
          rows={rows}
          total={all.length}
          userOptions={[...names.entries()].map(([id, name]) => ({ id, name }))}
          filters={{ userId: sp.userId ?? "", kind: sp.kind ?? "", from: sp.from ?? "", to: sp.to ?? "" }}
          back={back}
          currentUserId={user.id}
          isOwner={sub.ownerId === user.id}
        />
      </main>
    </>
  );
}
