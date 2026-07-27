import { redirect } from "next/navigation";
import { isoDay } from "@/lib/dates";
import { getCurrentUser } from "@/lib/auth/session";
import { listRates } from "@/lib/exchange/service";
import { prisma } from "@/lib/db";
import { RatesPanel } from "./RatesPanel";

export const dynamic = "force-dynamic";

export default async function RatesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { error } = await searchParams;
  const [rates, me] = await Promise.all([
    listRates(user.id),
    prisma.user.findUniqueOrThrow({ where: { id: user.id } }),
  ]);

  return (
    <>
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-black bg-[#E4E3E0] px-4 md:px-6">
        <div>
          <div className="text-[9px] uppercase tracking-[0.25em] text-neutral-500 f-mono">
            settings / rates
          </div>
          <h1 className="text-xl font-bold uppercase tracking-tight">汇率</h1>
        </div>
      </header>
      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-3xl">
          {error && (
            <div className="mb-4 border border-black bg-[#FF5A00] px-3 py-1.5 text-[10px] uppercase text-white f-mono">
              保存失败：请检查输入格式
            </div>
          )}
          <p className="mb-4 text-[10px] uppercase leading-relaxed tracking-wider text-neutral-500 f-mono">
            汇率只用于录入外币记录时预填折算值；保存进记录的是主币种快照，之后改汇率不影响历史（ADR-0004）。
          </p>
          <RatesPanel
            baseCurrency={me.baseCurrency}
            ratesApiUrl={me.ratesApiUrl ?? ""}
            rates={rates.map((r) => ({
              ...r,
              updatedAt: isoDay(r.updatedAt),
            }))}
          />
        </div>
      </div>
    </>
  );
}
