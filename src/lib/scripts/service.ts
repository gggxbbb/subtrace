// 用量脚本管理（ticket 03）：CRUD 守卫（所有者 + 额度型 + 信任用户 + cron 校验）。

import { prisma } from "../db";
import { isValidCron } from "./job";

export interface ScriptSubView {
  id: string;
  name: string;
  script: string | null;
  scriptCron: string | null;
  /** 发放形态：空 = RESET | STACKED（决定脚本返回值契约，ADR-0012） */
  grantMode: string | null;
  /** 编辑回显用：env 已配置时不回传内容，只标记 hasEnv */
  hasEnv: boolean;
}

/** 当前用户可管理脚本的额度型订阅列表（QUOTA 任意发放形态，ADR-0012） */
export async function listScriptSubs(userId: string): Promise<ScriptSubView[]> {
  const subs = await prisma.subscription.findMany({
    where: { ownerId: userId, usageKind: "QUOTA", status: "ACTIVE" },
    select: { id: true, name: true, script: true, scriptCron: true, scriptEnv: true, grantMode: true },
    orderBy: { createdAt: "asc" },
  });
  return subs.map((s) => ({
    id: s.id,
    name: s.name,
    script: s.script,
    scriptCron: s.scriptCron,
    grantMode: s.grantMode,
    hasEnv: s.scriptEnv !== null && s.scriptEnv !== "",
  }));
}

async function assertScriptOwner(userId: string, subscriptionId: string) {
  const [sub, user] = await Promise.all([
    prisma.subscription.findFirst({ where: { id: subscriptionId, ownerId: userId } }),
    prisma.user.findUniqueOrThrow({ where: { id: userId } }),
  ]);
  if (!sub) throw new Error("订阅不存在 subscription_not_found");
  if (!user.canUseScripts) throw new Error("未开放脚本权限 scripts_forbidden");
  if (sub.usageKind !== "QUOTA") throw new Error("仅额度型订阅支持脚本 quota_only");
  return sub;
}

/** 保存/清除脚本。script 为空串视为清除。scriptEnv：不传 = 不变；"{}" = 清空；其它须为 JSON 对象。 */
export async function saveScript(
  userId: string,
  subscriptionId: string,
  input: { script: string; scriptCron: string; scriptEnv?: string },
): Promise<void> {
  await assertScriptOwner(userId, subscriptionId);
  const code = input.script.trim();
  if (code === "") {
    await prisma.subscription.update({
      where: { id: subscriptionId },
      data: { script: null, scriptCron: null, scriptEnv: null },
    });
    return;
  }
  if (!isValidCron(input.scriptCron)) throw new Error("cron 表达式无效 bad_cron");
  if (input.scriptEnv !== undefined && input.scriptEnv.trim() !== "") {
    try {
      const parsed = JSON.parse(input.scriptEnv) as unknown;
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    } catch {
      throw new Error("env 须为 JSON 对象 bad_env");
    }
  }
  await prisma.subscription.update({
    where: { id: subscriptionId },
    data: {
      script: code,
      scriptCron: input.scriptCron.trim(),
      ...(input.scriptEnv !== undefined && input.scriptEnv.trim() === "{}"
        ? { scriptEnv: null }
        : input.scriptEnv !== undefined && input.scriptEnv.trim() !== ""
          ? { scriptEnv: input.scriptEnv.trim() }
          : {}),
    },
  });
}

/** 手动立即运行（走 runJob，落 JobRun） */
export async function runScriptNow(userId: string, subscriptionId: string): Promise<{ ok: boolean; message: string }> {
  await assertScriptOwner(userId, subscriptionId);
  const { runJob } = await import("../jobs");
  const { scriptJobKey } = await import("./job");
  return runJob(scriptJobKey(subscriptionId));
}
