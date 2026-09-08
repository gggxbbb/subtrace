// AI 摘要异步生成入口（ADR-0016）：banner 模板态挂载后拉取；session 守门，
// 内部 getDashboardData + getDigest（指纹缓存/单飞/负缓存均在 service 层）。

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getDashboardData } from "@/lib/dashboard";
import { getDigest } from "@/lib/digest/service";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  const d = await getDashboardData(user.id);
  const result = await getDigest(d, user.id);
  return NextResponse.json(result);
}
