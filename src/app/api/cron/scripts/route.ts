// 高频外部触发入口（ticket 03）：内置调度关闭或需要分钟级频率时使用。
// 例：*/15 * * * * curl -X POST -H "Authorization: Bearer $CRON_SECRET" "https://host/api/cron/scripts?minutes=15"

import { NextResponse } from "next/server";
import { runDueScriptsSince } from "@/lib/scripts/job";

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET 未配置" }, { status: 503 });
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "未授权" }, { status: 401 });
  }
  const minutes = Math.max(1, Number(new URL(req.url).searchParams.get("minutes")) || 15);
  const result = await runDueScriptsSince(minutes);
  return NextResponse.json({ ok: result.errors.length === 0, ...result });
}
