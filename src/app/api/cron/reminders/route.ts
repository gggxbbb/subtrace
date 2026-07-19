// 每日提醒扫描入口（ticket 08）：外部 cron 定时 POST，带 Bearer 密钥。
// 例：0 8 * * * curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://host/api/cron/reminders

import { NextResponse } from "next/server";
import { refreshAllAutoRates } from "@/lib/exchange/service";
import { runReminderScan } from "@/lib/reminders";

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET 未配置" }, { status: 503 });
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "未授权" }, { status: 401 });
  }
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const summary = await runReminderScan(today);
  // 汇率 AUTO 刷新共用每日节拍（ticket 09），与内置调度器路径对齐
  const rates = await refreshAllAutoRates();
  return NextResponse.json({ ok: true, ...summary, rates });
}
