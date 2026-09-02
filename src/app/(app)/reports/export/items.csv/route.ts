// 明细.csv（reports-redo ticket 04）：名称/类型/分类/摊销成本/日均/占比，与页面明细表同口径同序。

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getReportData, parseReportPeriod } from "@/lib/reports";
import { itemsCsv } from "@/lib/reports-csv";

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const period = parseReportPeriod(new URL(req.url).searchParams.get("period") ?? undefined);
  if (!period) return NextResponse.json({ error: "period 非法" }, { status: 400 });
  const r = await getReportData(user.id, period.startMs, period.endMs, period.label);
  // 文件名区间标签：自定义档冒号是 Windows 非法字符，换成下划线
  const tag = period.period.replaceAll(":", "_");
  return new Response(itemsCsv(r.items), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="subtrace-${tag}-items.csv"`,
    },
  });
}
