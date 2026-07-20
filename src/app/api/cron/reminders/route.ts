// 每日系统任务外部触发入口（ticket 08/09）：外部 cron 定时 POST，带 Bearer 密钥。
// 走 runJob（ADR-0006），运行记录与内置调度同一来源。
// 例：0 8 * * * curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://host/api/cron/reminders

import { NextResponse } from "next/server";
import { runJob } from "@/lib/jobs";

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET 未配置" }, { status: 503 });
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "未授权" }, { status: 401 });
  }
  const reminders = await runJob("reminders");
  const rates = await runJob("rates");
  return NextResponse.json({ ok: reminders.ok && rates.ok, reminders, rates });
}
