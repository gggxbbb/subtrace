"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "../auth/session";
import { runJob } from "./index";

/** 手动触发任务（调试；系统任务幂等——提醒靠唯一键、汇率快照覆盖） */
export async function runJobNowAction(key: string) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  await runJob(key);
  revalidatePath("/settings/jobs");
}
