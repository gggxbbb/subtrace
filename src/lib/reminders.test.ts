// 仓储缝测试：提醒扫描（ticket 08）。

import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "./db";
import { createSubscription } from "./subscriptions/service";
import { computeHits, parseRemindDays, runReminderScan } from "./reminders";

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const TODAY = d("2026-07-19");

let ownerId: string;

beforeEach(async () => {
  await prisma.reminderDelivery.deleteMany();
  await prisma.notificationChannel.deleteMany();
  await prisma.purchaseEvent.deleteMany();
  await prisma.usageRecord.deleteMany();
  await prisma.beneficiary.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.subscription.deleteMany();
  await prisma.session.deleteMany();
  await prisma.invite.deleteMany();
  await prisma.user.deleteMany();
  ownerId = (await prisma.user.create({ data: { username: "me", passwordHash: "x" } })).id;
});

const subWithExpiry = async (name: string, end: string, remindDays = "[7,3,0]") => {
  const sub = await createSubscription(ownerId, {
    name,
    trackingMode: "MANUAL",
    startDate: d("2026-01-01"),
  });
  await prisma.subscription.update({ where: { id: sub.id }, data: { remindDays } });
  await prisma.payment.create({
    data: {
      subscriptionId: sub.id,
      amount: 100,
      currency: "CNY",
      amountBase: 100,
      paidAt: d("2026-01-01"),
      periodStart: d("2026-01-01"),
      periodEnd: d(end),
      source: "MANUAL",
    },
  });
  return sub;
};

describe("parseRemindDays", () => {
  it("解析、去重、降序；坏数据兜底空数组", () => {
    expect(parseRemindDays("[7,3,0,3]")).toEqual([7, 3, 0]);
    expect(parseRemindDays("oops")).toEqual([]);
    expect(parseRemindDays('{"a":1}')).toEqual([]);
    expect(parseRemindDays("[1.5,-2,'x']")).toEqual([]);
  });
});

describe("computeHits", () => {
  it("到期日−提醒天数=今天 才命中；多档各命中一次", async () => {
    await subWithExpiry("3天后", "2026-07-22");
    await subWithExpiry("7天后", "2026-07-26");
    await subWithExpiry("不在档上", "2026-07-21");
    await subWithExpiry("空档位", "2026-07-20", "[]");
    const hits = await computeHits(ownerId, TODAY);
    expect(hits.map((h) => [h.subscriptionName, h.dayOffset])).toEqual([
      ["3天后", 3],
      ["7天后", 7],
    ]);
  });

  it("已取消与手动模式无到期日的不命中", async () => {
    const s = await subWithExpiry("已取消", "2026-07-22");
    await prisma.subscription.update({ where: { id: s.id }, data: { status: "CANCELLED" } });
    await createSubscription(ownerId, {
      name: "无记录",
      trackingMode: "MANUAL",
      startDate: d("2026-01-01"),
    });
    expect(await computeHits(ownerId, TODAY)).toEqual([]);
  });
});

describe("runReminderScan", () => {
  it("命中后向启用渠道投递并落记录；重复扫描按唯一键去重", async () => {
    await subWithExpiry("视频", "2026-07-22"); // 3 天后
    const channel = await prisma.notificationChannel.create({
      data: { userId: ownerId, kind: "WEBHOOK", name: "wh", config: '{"url":"https://example.com/hook"}' },
    });
    const sent: { kind: string; title: string }[] = [];
    const deliverFn = async (kind: string, _c: unknown, p: { title: string }) => {
      sent.push({ kind, title: p.title });
      return { ok: true as const };
    };

    const first = await runReminderScan(TODAY, deliverFn);
    expect(first).toMatchObject({ hits: 1, sent: 1, failed: 0, skipped: 0 });
    expect(sent[0]).toEqual({ kind: "WEBHOOK", title: "[subtrace] 视频 3 天后到期" });

    // 同一天再扫：唯一键去重，不重复投递
    const second = await runReminderScan(TODAY, deliverFn);
    expect(second).toMatchObject({ sent: 0, skipped: 1 });
    expect(sent).toHaveLength(1);

    const rows = await prisma.reminderDelivery.findMany({ where: { channelId: channel.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("OK");
  });

  it("投递失败落 FAIL 记录；禁用渠道不投递", async () => {
    await subWithExpiry("健身房", "2026-07-19"); // 今天到期
    await prisma.notificationChannel.create({
      data: { userId: ownerId, kind: "EMAIL", name: "mail", config: "{}", enabled: false },
    });
    const failChannel = await prisma.notificationChannel.create({
      data: { userId: ownerId, kind: "EMAIL", name: "mail2", config: "{}" },
    });
    const summary = await runReminderScan(TODAY, async () => ({ ok: false as const, error: "SMTP 拒绝" }));
    expect(summary).toMatchObject({ sent: 0, failed: 1 });

    const rows = await prisma.reminderDelivery.findMany({ where: { channelId: failChannel.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: "FAIL", error: "SMTP 拒绝", dayOffset: 0 });

    // FAIL 不占坑：修好渠道后重跑会重试并更新原记录，而不是跳过
    const retry = await runReminderScan(TODAY, async () => ({ ok: true as const }));
    expect(retry).toMatchObject({ sent: 1, skipped: 0 });
    const after = await prisma.reminderDelivery.findMany({ where: { channelId: failChannel.id } });
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({ status: "OK", error: null });

    // OK 之后才占坑：再跑跳过
    const third = await runReminderScan(TODAY, async () => ({ ok: true as const }));
    expect(third).toMatchObject({ sent: 0, skipped: 1 });
  });
});
