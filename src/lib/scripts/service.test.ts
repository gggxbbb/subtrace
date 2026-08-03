// 仓储缝测试：脚本管理与执行（ticket 03）。

import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../db";
import { createSubscription } from "../subscriptions/service";
import { executeScriptJob, isValidCron, loadScriptJobs, resolveScriptJob, scriptJobKey } from "./job";
import { listScriptSubs, saveScript } from "./service";

const d = (s: string) => new Date(`${s}T00:00:00+08:00`);

let ownerId: string;
let otherId: string;

beforeEach(async () => {
  await prisma.jobRun.deleteMany();
  await prisma.reminderDelivery.deleteMany();
  await prisma.notificationChannel.deleteMany();
  await prisma.usageRecord.deleteMany();
  await prisma.beneficiary.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.subscription.deleteMany();
  await prisma.purchaseEvent.deleteMany();
  await prisma.purchase.deleteMany();
  await prisma.session.deleteMany();
  await prisma.invite.deleteMany();
  await prisma.user.deleteMany();
  ownerId = (await prisma.user.create({ data: { username: "me", passwordHash: "x", canUseScripts: true } })).id;
  otherId = (await prisma.user.create({ data: { username: "other", passwordHash: "x" } })).id;
});

const quotaSub = (name = "机场") =>
  createSubscription(ownerId, {
    name,
    trackingMode: "MANUAL",
    startDate: d("2026-07-01"),
  }).then(async (s) => {
    await prisma.subscription.update({ where: { id: s.id }, data: { usageKind: "QUOTA", quotaTotal: 1000 } });
    return s;
  });

describe("saveScript 守卫", () => {
  it("cron 非法 / env 非 JSON 对象 / 非额度型 / 非信任用户 / 非所有者 均拒绝", async () => {
    const sub = await quotaSub();
    await expect(saveScript(ownerId, sub.id, { script: "return 1;", scriptCron: "not-a-cron" })).rejects.toThrow(/cron/);
    await expect(saveScript(ownerId, sub.id, { script: "return 1;", scriptCron: "0 * * * *", scriptEnv: "[1]" })).rejects.toThrow(/env/);

    const countSub = await createSubscription(ownerId, { name: "健身房", trackingMode: "MANUAL", startDate: d("2026-07-01") });
    await expect(saveScript(ownerId, countSub.id, { script: "return 1;", scriptCron: "0 * * * *" })).rejects.toThrow(/quota_only/);

    await expect(saveScript(otherId, sub.id, { script: "return 1;", scriptCron: "0 * * * *" })).rejects.toThrow(/forbidden|不存在/);
    await expect(saveScript(ownerId, "missing", { script: "return 1;", scriptCron: "0 * * * *" })).rejects.toThrow(/不存在/);
  });

  it("保存后可解析出任务定义；清空后任务消失", async () => {
    const sub = await quotaSub();
    await saveScript(ownerId, sub.id, { script: "return { used: 5 };", scriptCron: "0 */6 * * *" });
    const job = await resolveScriptJob(scriptJobKey(sub.id));
    expect(job).toMatchObject({ cron: "0 */6 * * *", catchUp: false });
    expect(await loadScriptJobs()).toHaveLength(1);

    await saveScript(ownerId, sub.id, { script: "", scriptCron: "" });
    expect(await resolveScriptJob(scriptJobKey(sub.id))).toBeNull();
    expect(await loadScriptJobs()).toHaveLength(0);
  });

  it("env 不回显内容只标记存在；不传 env 保留原值", async () => {
    const sub = await quotaSub();
    await saveScript(ownerId, sub.id, { script: "return env.token;", scriptCron: "0 * * * *", scriptEnv: '{"token":"abc"}' });
    let views = await listScriptSubs(ownerId);
    expect(views[0].hasEnv).toBe(true);
    expect(JSON.stringify(views[0])).not.toContain("abc");

    await saveScript(ownerId, sub.id, { script: "return 2;", scriptCron: "0 * * * *" });
    views = await listScriptSubs(ownerId);
    expect(views[0].hasEnv).toBe(true); // 未传 env → 保留
  });

  it("QUOTA 任意发放形态可挂脚本（STACKED 放行）；SAVINGS 拒绝", async () => {
    const sub = await quotaSub();
    await prisma.subscription.update({ where: { id: sub.id }, data: { grantMode: "STACKED" } });
    await saveScript(ownerId, sub.id, { script: "return { remaining: 18 };", scriptCron: "0 * * * *" });
    expect(await resolveScriptJob(scriptJobKey(sub.id))).not.toBeNull();
    const views = await listScriptSubs(ownerId);
    expect(views[0].grantMode).toBe("STACKED");

    const sav = await createSubscription(ownerId, { name: "京东Plus", trackingMode: "MANUAL", startDate: d("2026-07-01") });
    await prisma.subscription.update({ where: { id: sav.id }, data: { usageKind: "SAVINGS" } });
    await expect(saveScript(ownerId, sav.id, { script: "return 1;", scriptCron: "0 * * * *" })).rejects.toThrow(/quota_only/);
  });
});

describe("executeScriptJob", () => {
  it("产出写 TOTAL 快照（source=SCRIPT，total 覆盖额度）", async () => {
    const sub = await quotaSub();
    await saveScript(ownerId, sub.id, { script: "return { used: 234.5, total: 500 };", scriptCron: "0 * * * *" });
    const msg = await executeScriptJob(sub.id);
    expect(msg).toContain("234.5");
    const rec = await prisma.usageRecord.findFirstOrThrow({ where: { subscriptionId: sub.id } });
    expect(rec).toMatchObject({ kind: "TOTAL", source: "SCRIPT", quantity: 234.5, quotaTotal: 500 });
  });

  it("脚本失败抛错（含日志），不写快照", async () => {
    const sub = await quotaSub();
    await saveScript(ownerId, sub.id, { script: "console.log('拉取中');\nthrow new Error('API 401');", scriptCron: "0 * * * *" });
    await expect(executeScriptJob(sub.id)).rejects.toThrow(/API 401/);
    await expect(executeScriptJob(sub.id)).rejects.toThrow(/拉取中/);
    expect(await prisma.usageRecord.count()).toBe(0);
  });

  it("信任撤销后调度路径同样拒绝（ADR-0007 防线）", async () => {
    const sub = await quotaSub();
    await saveScript(ownerId, sub.id, { script: "return 1;", scriptCron: "0 * * * *" });
    await prisma.user.update({ where: { id: ownerId }, data: { canUseScripts: false } });
    await expect(executeScriptJob(sub.id)).rejects.toThrow(/forbidden/);
    expect(await resolveScriptJob(scriptJobKey(sub.id))).toBeNull();
    expect(await loadScriptJobs()).toHaveLength(0);
  });

  it("isValidCron 校验", () => {
    expect(isValidCron("0 */6 * * *")).toBe(true);
    expect(isValidCron("not-a-cron")).toBe(false);
    expect(isValidCron("")).toBe(false);
  });

  it("STACKED：返回 { remaining } 写 TOTAL 剩余快照（source=SCRIPT）", async () => {
    const sub = await quotaSub();
    await prisma.subscription.update({ where: { id: sub.id }, data: { grantMode: "STACKED" } });
    await saveScript(ownerId, sub.id, { script: "return { remaining: 18 };", scriptCron: "0 * * * *" });
    const msg = await executeScriptJob(sub.id);
    expect(msg).toContain("18");
    const rec = await prisma.usageRecord.findFirstOrThrow({ where: { subscriptionId: sub.id } });
    expect(rec).toMatchObject({ kind: "TOTAL", source: "SCRIPT", quantity: 18, quotaTotal: null });
  });

  it("形态不匹配明确报错：STACKED 收 used / RESET 收 remaining，均不写快照", async () => {
    const stackedSub = await quotaSub("像素蛋糕");
    await prisma.subscription.update({ where: { id: stackedSub.id }, data: { grantMode: "STACKED" } });
    await saveScript(ownerId, stackedSub.id, { script: "return { used: 5 };", scriptCron: "0 * * * *" });
    await expect(executeScriptJob(stackedSub.id)).rejects.toThrow(/remaining.*mismatch|mismatch/);

    const resetSub = await quotaSub("机场2");
    await saveScript(ownerId, resetSub.id, { script: "return { remaining: 5 };", scriptCron: "0 * * * *" });
    await expect(executeScriptJob(resetSub.id)).rejects.toThrow(/used.*mismatch|mismatch/);

    expect(await prisma.usageRecord.count()).toBe(0);
  });
});
