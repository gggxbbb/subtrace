import { notFound, redirect } from "next/navigation";
import { isoDay } from "@/lib/dates";
import { MoneyFields } from "@/components/MoneyFields";
import { getCurrentUser } from "@/lib/auth/session";
import { getPurchase } from "@/lib/purchases/service";
import { updatePurchaseAction } from "@/lib/purchases/actions";

export const dynamic = "force-dynamic";

const inputCls =
  "w-full border border-black bg-[#E4E3E0] px-2 py-1.5 text-sm outline-none focus:bg-white";
const labelCls =
  "mb-1 block text-[10px] uppercase tracking-[0.15em] text-neutral-500 f-mono";

export default async function EditPurchasePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { id } = await params;
  const purchase = await getPurchase(user.id, id);
  if (!purchase) notFound();

  return (
    <>
      <header className="flex h-16 items-center border-b border-black bg-[#E4E3E0] px-4 md:px-6">
        <div>
          <div className="text-[9px] uppercase tracking-[0.25em] text-neutral-500 f-mono">
            purchases / {purchase.name} / edit
          </div>
          <h1 className="text-xl font-bold uppercase tracking-tight">编辑物品</h1>
        </div>
      </header>
      <main className="mx-auto max-w-xl px-4 py-8 md:px-6">
        <form action={updatePurchaseAction.bind(null, purchase.id)} className="space-y-4 border border-black bg-white p-5">
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
          <button className="w-full bg-black py-2.5 text-[11px] font-semibold uppercase tracking-wider text-white hover:bg-neutral-800">
            保存 →
          </button>
          <a
            href={`/purchases/${purchase.id}`}
            className="block border border-black bg-white py-2.5 text-center text-[11px] uppercase tracking-wider hover:bg-black hover:text-white"
          >
            取消
          </a>
        </form>
      </main>
    </>
  );
}
