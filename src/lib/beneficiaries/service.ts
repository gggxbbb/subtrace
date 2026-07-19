// 受益实体（ticket 07）：用户/物品按权重分摊订阅成本（ADR-0003）。

import { prisma } from "../db";
import type { Beneficiary } from "@/generated/prisma/client";

export type BeneficiaryWithRefs = Beneficiary & {
  user: { id: string; username: string } | null;
  purchase: { id: string; name: string } | null;
};

export const beneficiaryInclude = {
  user: { select: { id: true, username: true } },
  purchase: { select: { id: true, name: true } },
} as const;

async function assertOwnedSub(ownerId: string, subscriptionId: string) {
  const sub = await prisma.subscription.findFirst({ where: { id: subscriptionId, ownerId } });
  if (!sub) throw new Error("订阅不存在或无权限（仅所有者可操作）");
  return sub;
}

export async function listBeneficiaries(subscriptionId: string): Promise<BeneficiaryWithRefs[]> {
  return prisma.beneficiary.findMany({
    where: { subscriptionId },
    include: beneficiaryInclude,
    orderBy: { createdAt: "asc" },
  });
}

/** 受益人行视图（详情页用）：显示名、份额、是否所有者占位行 */
export function beneficiaryRows(
  sub: { ownerId: string; beneficiaries: (Beneficiary & { user: { username: string } | null; purchase: { name: string } | null })[] },
) {
  return beneficiaryShares(sub.beneficiaries).map((s) => {
    const b = sub.beneficiaries.find((x) => x.id === s.beneficiaryId)!;
    return {
      id: b.id,
      kind: b.kind as "USER" | "ITEM",
      name: b.user?.username ?? b.purchase?.name ?? "?",
      weight: b.weight,
      share: s.share,
      isOwnerRow: b.userId === sub.ownerId,
    };
  });
}

/** 可添加的候选（未成为受益人的其他用户 + 所有者在用物品） */
export async function listBeneficiaryCandidates(ownerId: string, subscriptionId: string) {
  const existing = await prisma.beneficiary.findMany({
    where: { subscriptionId },
    select: { userId: true, purchaseId: true },
  });
  const existingRefs = new Set(existing.map((b) => b.userId ?? b.purchaseId));
  const users = (
    await prisma.user.findMany({ select: { id: true, username: true }, orderBy: { username: "asc" } })
  ).filter((u) => u.id !== ownerId && !existingRefs.has(u.id));
  const items = await prisma.purchase.findMany({
    where: { ownerId, status: "IN_USE", id: { notIn: [...existingRefs].filter((x): x is string => !!x) } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  return { users, items };
}

/** 每个受益实体的份额（权重 / Σ权重）；refId = userId 或 purchaseId */
export function beneficiaryShares(list: Beneficiary[]): {
  beneficiaryId: string;
  kind: string;
  refId: string;
  weight: number;
  share: number;
}[] {
  const sum = list.reduce((s, b) => s + b.weight, 0);
  return list.map((b) => ({
    beneficiaryId: b.id,
    kind: b.kind,
    refId: (b.userId ?? b.purchaseId)!,
    weight: b.weight,
    share: sum > 0 ? b.weight / sum : 0,
  }));
}

/** 某实体（用户或物品）的份额；无受益人配置时所有者视作 100% */
export function shareFor(list: Beneficiary[], ownerId: string, refId: string): number {
  if (list.length === 0) return refId === ownerId ? 1 : 0;
  const sum = list.reduce((s, b) => s + b.weight, 0);
  const mine = list.find((b) => (b.userId ?? b.purchaseId) === refId)?.weight ?? 0;
  return sum > 0 ? mine / sum : 0;
}

/**
 * 添加受益实体。首个加入时自动补上所有者（权重 1）——
 * 从此订阅进入分摊状态，所有者也是受益人之一。
 */
export async function addBeneficiary(
  ownerId: string,
  subscriptionId: string,
  input: { kind: "USER" | "ITEM"; userId?: string; purchaseId?: string; weight?: number },
): Promise<Beneficiary> {
  await assertOwnedSub(ownerId, subscriptionId);
  const weight = input.weight ?? 1;
  if (weight <= 0) throw new Error("权重必须为正数");
  const refId = input.kind === "USER" ? input.userId : input.purchaseId;
  if (!refId) throw new Error("缺少受益实体引用");
  if (input.kind === "USER" && refId === ownerId) throw new Error("所有者无需手动添加");
  if (input.kind === "ITEM") {
    const purchase = await prisma.purchase.findFirst({ where: { id: refId, ownerId } });
    if (!purchase) throw new Error("物品不存在或无权限");
  }
  const existing = await prisma.beneficiary.findMany({ where: { subscriptionId } });
  if (existing.some((b) => (b.userId ?? b.purchaseId) === refId)) {
    throw new Error("该受益实体已存在（重复添加）");
  }
  return prisma.$transaction(async (tx) => {
    if (existing.length === 0) {
      // 进入分摊状态：自动补所有者占位行
      await tx.beneficiary.create({
        data: { subscriptionId, kind: "USER", userId: ownerId, weight: 1 },
      });
    }
    return tx.beneficiary.create({
      data: {
        subscriptionId,
        kind: input.kind,
        userId: input.kind === "USER" ? refId : null,
        purchaseId: input.kind === "ITEM" ? refId : null,
        weight,
      },
    });
  });
}

/** 移除受益实体；若移除后只剩所有者占位行，一并清除回到无分摊状态 */
export async function removeBeneficiary(ownerId: string, beneficiaryId: string): Promise<void> {
  const b = await prisma.beneficiary.findFirst({
    where: { id: beneficiaryId, subscription: { ownerId } },
  });
  if (!b) throw new Error("受益实体不存在或无权限");
  await prisma.$transaction(async (tx) => {
    await tx.beneficiary.delete({ where: { id: beneficiaryId } });
    const rest = await tx.beneficiary.findMany({ where: { subscriptionId: b.subscriptionId } });
    if (rest.length === 1 && rest[0].userId === ownerId) {
      await tx.beneficiary.delete({ where: { id: rest[0].id } });
    }
  });
}

/** 改权重；全局按新比例重算（计算是实时的，无需额外动作） */
export async function setBeneficiaryWeight(
  ownerId: string,
  beneficiaryId: string,
  weight: number,
): Promise<void> {
  if (weight <= 0) throw new Error("权重必须为正数");
  const b = await prisma.beneficiary.findFirst({
    where: { id: beneficiaryId, subscription: { ownerId } },
  });
  if (!b) throw new Error("受益实体不存在或无权限");
  await prisma.beneficiary.update({ where: { id: beneficiaryId }, data: { weight } });
}
