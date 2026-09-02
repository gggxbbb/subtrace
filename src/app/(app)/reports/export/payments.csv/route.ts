// 实付流水.csv（reports-redo ticket 04）：日期/名称/原币金额/币种/折算主币金额，区间内实付流水。

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getReportData, parseReportPeriod } from "@/lib/reports";
import { paymentsCsv } from "@/lib/reports-csv";

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const period = parseReportPeriod(new URL(req.url).searchParams.get("period") ?? undefined);
  if (!period) return NextResponse.json({ error: "period 非法" }, { status: 400 });
  const r = await getReportData(user.id, period.startMs, period.endMs, period.label);
  const tag = period.period.replaceAll(":", "_");
  return new Response(paymentsCsv(r.payments), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="subtrace-${tag}-payments.csv"`,
    },
  });
}
