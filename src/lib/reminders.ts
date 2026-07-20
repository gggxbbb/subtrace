// 提醒扫描引擎（ticket 08）：每日命中「到期日 − remindDays = 今天」的订阅，经启用渠道投递并落记录。

import { currentExpiry, dayDiff } from "./cost-engine";
import { isoDay } from "./dates";
import { deliver, type DeliverResult } from "./notifications/dispatch";
import { prisma } from "./db";
import { toEnginePayments, toEngineSub } from "./subscriptions/service";

export interface ReminderHit {
  subscriptionId: string;
  subscriptionName: string;
  dueDate: Date;
  dayOffset: number;
}

export function parseRemindDays(raw: string): number[] {
  try {
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    return [...new Set(arr.filter((n): n is number => Number.isInteger(n) && (n as number) >= 0))].sort(
      (a, b) => b - a,
    );
  } catch {
    return [];
  }
}

/** 计算某用户当日命中的提醒（不含投递）。 */
export async function computeHits(userId: string, today: Date): Promise<ReminderHit[]> {
  const subs = await prisma.subscription.findMany({
    where: { ownerId: userId, status: "ACTIVE" },
    include: { payments: true },
  });
  const hits: ReminderHit[] = [];
  for (const sub of subs) {
    const days = parseRemindDays(sub.remindDays);
    if (days.length === 0) continue;
    const expiry = currentExpiry(toEngineSub(sub), toEnginePayments(sub.payments), today);
    if (!expiry) continue;
    const offset = dayDiff(today, expiry);
    if (days.includes(offset)) {
      hits.push({ subscriptionId: sub.id, subscriptionName: sub.name, dueDate: expiry, dayOffset: offset });
    }
  }
  return hits;
}

export interface ScanSummary {
  users: number;
  hits: number;
  sent: number;
  failed: number;
  /** 已投递过（唯一键去重）而跳过的条数 */
  skipped: number;
}

type DeliverFn = (kind: string, config: unknown, payload: Parameters<typeof deliver>[2]) => Promise<DeliverResult>;

/** 全量扫描（cron 入口）。deliverFn 可注入替身做测试。 */
export async function runReminderScan(today: Date, deliverFn: DeliverFn = deliver): Promise<ScanSummary> {
  const users = await prisma.user.findMany({ select: { id: true, baseCurrency: true } });
  const summary: ScanSummary = { users: users.length, hits: 0, sent: 0, failed: 0, skipped: 0 };

  for (const user of users) {
    const hits = await computeHits(user.id, today);
    if (hits.length === 0) continue;
    summary.hits += hits.length;
    const channels = await prisma.notificationChannel.findMany({
      where: { userId: user.id, enabled: true },
    });

    for (const hit of hits) {
      for (const channel of channels) {
        // 唯一键去重：同一渠道/订阅/到期日/偏移只投递一次；FAIL 不占坑，重跑可重试
        const dup = await prisma.reminderDelivery.findUnique({
          where: {
            channelId_subscriptionId_dueDate_dayOffset: {
              channelId: channel.id,
              subscriptionId: hit.subscriptionId,
              dueDate: hit.dueDate,
              dayOffset: hit.dayOffset,
            },
          },
        });
        if (dup?.status === "OK") {
          summary.skipped += 1;
          continue;
        }

        let config: unknown;
        try {
          config = JSON.parse(channel.config);
        } catch {
          config = undefined;
        }
        const iso = isoDay(hit.dueDate);
        const result = config === undefined
          ? { ok: false as const, error: "渠道配置损坏" }
          : await deliverFn(channel.kind, config, {
              title: `[subtrace] ${hit.subscriptionName} ${hit.dayOffset === 0 ? "今天到期" : `${hit.dayOffset} 天后到期`}`,
              body: `订阅「${hit.subscriptionName}」将于 ${iso} 到期（还剩 ${hit.dayOffset} 天），请及时处理续费。`,
              meta: {
                subscriptionId: hit.subscriptionId,
                subscriptionName: hit.subscriptionName,
                dueDate: iso,
                dayOffset: hit.dayOffset,
              },
            });

        const record = {
          status: result.ok ? "OK" : "FAIL",
          error: result.ok ? null : result.error,
          sentAt: new Date(),
        };
        if (dup) {
          await prisma.reminderDelivery.update({ where: { id: dup.id }, data: record });
        } else {
          await prisma.reminderDelivery.create({
            data: {
              channelId: channel.id,
              subscriptionId: hit.subscriptionId,
              dueDate: hit.dueDate,
              dayOffset: hit.dayOffset,
              ...record,
            },
          });
        }
        if (result.ok) summary.sent += 1;
        else summary.failed += 1;
      }
    }
  }
  return summary;
}
