import { notFound, redirect } from "next/navigation";
import { isoDay } from "@/lib/dates";
import { MoneyFields } from "@/components/MoneyFields";
import { PageHeader } from "@/components/PageHeader";
import { getCurrentUser } from "@/lib/auth/session";
import { getPurchase } from "@/lib/purchases/service";
import { updatePurchaseAction } from "@/lib/purchases/actions";
import { inputCls, labelCls, ErrorBanner } from "@/components/te";

export const dynamic = "force-dynamic";


export default async function EditPurchasePage({
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
  const purchase = await getPurchase(user.id, id);
  if (!purchase) notFound();

  return (
    <>
      <PageHeader
        crumb={<>purchases / {purchase.name} / edit</>}
        title={<>编辑物品</>}
      />
      <main className="mx-auto max-w-xl px-4 py-8 md:px-6">
        <ErrorBanner error={error ?? null} defaultMessage="保存失败：请检查必填项" className="mb-4" />
        <form action={updatePurchaseAction.bind(null, purchase.id)} className="space-y-4 border border-ink bg-surface p-5">
        <MoneyFields
          defaults={{
            amount: purchase.amount,
            currency: purchase.currency,
            amountBase: purchase.amountBase,
          }}
          labels={{ amount: "买入价" }}
        />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className={labelCls}>名称</label>
            <input name="name" defaultValue={purchase.name} required className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>分类</label>
            <input name="category" defaultValue={purchase.category ?? ""} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>购买日期</label>
            <input name="purchaseDate" type="date" defaultValue={isoDay(purchase.purchaseDate)} required className={`${inputCls} f-mono`} />
          </div>
          <div>
            <label className={labelCls}>预期寿命（天，留空=未定）</label>
            <input name="expectedDays" type="number" min="1" defaultValue={purchase.expectedDays ?? ""} className={inputCls} />
          </div>
        </div>
          <button className="w-full bg-ink py-2.5 text-[11px] font-semibold uppercase tracking-wider text-surface hover:bg-ink-hover">
            保存 →
          </button>
          <a
            href={`/purchases/${purchase.id}`}
            className="block border border-ink bg-surface py-2.5 text-center text-[11px] uppercase tracking-wider hover:bg-ink hover:text-surface"
          >
            取消
          </a>
        </form>
      </main>
    </>
  );
}
