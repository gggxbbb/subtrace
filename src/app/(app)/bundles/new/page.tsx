import { Suspense } from "react";
import { isoDay } from "@/lib/dates";
import { getCurrentUser } from "@/lib/auth/session";
import { currentExpiry } from "@/lib/cost-engine";
import {
  listSubscriptions,
  toEnginePayments,
  toEngineSub,
} from "@/lib/subscriptions/service";
import { BundleWizard } from "./BundleWizard";

export default async function NewBundlePage() {
  const user = (await getCurrentUser())!;
  // 联合会员只能打包自己拥有的订阅（共享来的不能转包）
  const subs = (await listSubscriptions(user.id)).filter((s) => s.ownerId === user.id);
  const today = new Date();
  const existingSubs = subs.map((s) => {
    const expiry = currentExpiry(toEngineSub(s), toEnginePayments(s.payments), today);
    return {
      id: s.id,
      name: s.name,
      expiry: expiry ? isoDay(expiry) : null,
    };
  });

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 md:px-6">
      <div className="mb-1 text-[9px] uppercase tracking-[0.25em] text-neutral-500 f-mono">
        bundles / new
      </div>
      <h1 className="mb-5 text-xl font-bold uppercase tracking-tight">新建联合会员</h1>
      <Suspense>
        <BundleWizard existingSubs={existingSubs} />
      </Suspense>
    </div>
  );
}
