import { Suspense } from "react";
import { isoDay } from "@/lib/dates";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getBundle } from "@/lib/bundles/service";
import { replaceBundleAction } from "@/lib/bundles/actions";
import { listSubscriptions, toEnginePayments, toEngineSub } from "@/lib/subscriptions/service";
import { currentExpiry } from "@/lib/cost-engine";
import { BundleWizard, type Item } from "../../new/BundleWizard";

export const dynamic = "force-dynamic";

export default async function EditBundlePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { id } = await params;
  const bundle = await getBundle(user.id, id);
  if (!bundle) notFound();

  const iso = (d: Date) => isoDay(d);
  // 联合会员候选：自己拥有的订阅（共享来的不能转包）
  const subs = (await listSubscriptions(user.id)).filter((s) => s.ownerId === user.id);
  const today = new Date();
  const existingSubs = subs.map((s) => {
    const expiry = currentExpiry(toEngineSub(s), toEnginePayments(s.payments), today);
    return { id: s.id, name: s.name, expiry: expiry ? iso(expiry) : null };
  });

  // 预填：每笔 BUNDLE 付费记录还原为一个「关联已有」子会员行
  const items: Item[] = bundle.payments.map((p) => ({
    mode: "existing",
    subscriptionId: p.subscriptionId,
    newName: "",
    listPriceBase: "", // 原价当时未物化，留空按比例重新分摊
    allocatedBase: (p.amountBase ?? 0).toString(),
    periodStart: iso(p.periodStart),
    periodEnd: iso(p.periodEnd),
    plusDays: "",
    periodTouched: true,
  }));

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 md:px-6">
      <div className="mb-1 text-[9px] uppercase tracking-[0.25em] text-neutral-500 f-mono">
        bundles / {bundle.name} / edit
      </div>
      <h1 className="mb-5 text-xl font-bold uppercase tracking-tight">编辑联合会员</h1>
      <div className="mb-4 border border-dashed border-neutral-400 bg-white px-3 py-2 text-[11px] text-neutral-600">
        保存将<strong>重建全部 {bundle.payments.length} 笔分摊付费记录</strong>（按新配置重新分摊）；
        对单笔分摊做过的手动修改会丢失。子会员可增删改。
      </div>
      <Suspense>
        <BundleWizard
          existingSubs={existingSubs}
          currency={user.baseCurrency}
          initial={{
            name: bundle.name,
            totalAmount: bundle.totalAmount.toString(),
            currency: bundle.currency,
            periodStart: iso(bundle.periodStart),
            periodEnd: iso(bundle.periodEnd),
            items,
          }}
          action={replaceBundleAction.bind(null, bundle.id)}
          submitLabel="保存并重建分摊 →"
        />
      </Suspense>
    </div>
  );
}
