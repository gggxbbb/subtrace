// 认证与邀请（ticket 02）：注册（邀请制）、登录、会话。
// 密码 argon2 哈希；session 存库，cookie 只带 id。

import { randomBytes, randomUUID } from "node:crypto";
import { hash, verify } from "@node-rs/argon2";
import { prisma } from "../db";
import type { User } from "@/generated/prisma/client";

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 天
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 天

export type SafeUser = Pick<User, "id" | "username" | "role" | "baseCurrency">;

const toSafe = (u: User): SafeUser => ({
  id: u.id,
  username: u.username,
  role: u.role,
  baseCurrency: u.baseCurrency,
});

/** 注册：空库首个用户为 ADMIN 且无需邀请；此后必须凭有效邀请，注册后为 USER。 */
export async function register(
  username: string,
  password: string,
  inviteToken?: string,
): Promise<SafeUser> {
  const userCount = await prisma.user.count();
  let role = "USER";
  if (userCount === 0) {
    role = "ADMIN";
  } else {
    if (!inviteToken) throw new Error("需要邀请 invite_required");
    const invite = await prisma.invite.findUnique({ where: { token: inviteToken } });
    if (!invite || invite.usedById || invite.expiresAt < new Date()) {
      throw new Error("邀请无效或已过期 invite_invalid");
    }
  }
  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) throw new Error("用户名已被占用 username_taken");

  const user = await prisma.user.create({
    data: { username, passwordHash: await hash(password), role },
  });
  if (userCount > 0 && inviteToken) {
    await prisma.invite.update({ where: { token: inviteToken }, data: { usedById: user.id } });
  }
  return toSafe(user);
}

/** 登录：校验用户名密码，成功返回用户。 */
export async function login(username: string, password: string): Promise<SafeUser> {
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user || !(await verify(user.passwordHash, password))) {
    throw new Error("用户名或密码错误 invalid_credentials");
  }
  return toSafe(user);
}

/** 创建会话（默认 30 天）。 */
export async function createSession(userId: string, expiresAt?: Date) {
  return prisma.session.create({
    data: {
      id: randomBytes(32).toString("hex"),
      userId,
      expiresAt: expiresAt ?? new Date(Date.now() + SESSION_TTL_MS),
    },
  });
}

/** 取会话用户；不存在或已过期返回 null。 */
export async function getSessionUser(sessionId: string): Promise<SafeUser | null> {
  const session = await prisma.session.findUnique({ where: { id: sessionId }, include: { user: true } });
  if (!session || session.expiresAt < new Date()) return null;
  return toSafe(session.user);
}

export async function invalidateSession(sessionId: string) {
  await prisma.session.deleteMany({ where: { id: sessionId } });
}

/** 生成一次性邀请（默认 7 天有效）。 */
export async function createInvite(creatorId: string, expiresAt?: Date) {
  return prisma.invite.create({
    data: {
      token: randomUUID(),
      creatorId,
      expiresAt: expiresAt ?? new Date(Date.now() + INVITE_TTL_MS),
    },
  });
}

/** 用户列表（管理页）：用户名/角色/注册时间/订阅数 */
export async function listUsers() {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      username: true,
      role: true,
      baseCurrency: true,
      createdAt: true,
      _count: { select: { subscriptions: true } },
    },
  });
  return users.map((u) => ({
    id: u.id,
    username: u.username,
    role: u.role,
    baseCurrency: u.baseCurrency,
    createdAt: u.createdAt,
    subscriptionCount: u._count.subscriptions,
  }));
}

export interface InviteView {
  token: string;
  createdBy: string;
  usedBy: string | null;
  expiresAt: Date;
  createdAt: Date;
}

/** 邀请列表（管理页）：含状态判定的原始数据 */
export async function listInvites(): Promise<InviteView[]> {
  const rows = await prisma.invite.findMany({
    orderBy: { createdAt: "desc" },
    include: { creator: { select: { username: true } } },
  });
  const usedByIds = rows.map((r) => r.usedById).filter((id): id is string => id !== null);
  const usedByUsers = await prisma.user.findMany({
    where: { id: { in: usedByIds } },
    select: { id: true, username: true },
  });
  const nameOf = new Map(usedByUsers.map((u) => [u.id, u.username]));
  return rows.map((r) => ({
    token: r.token,
    createdBy: r.creator.username,
    usedBy: r.usedById ? (nameOf.get(r.usedById) ?? "?") : null,
    expiresAt: r.expiresAt,
    createdAt: r.createdAt,
  }));
}

/** 吊销未使用的邀请 */
export async function revokeInvite(token: string): Promise<void> {
  await prisma.invite.deleteMany({ where: { token, usedById: null } });
}

/** 管理操作的共同护栏：不能操作自己；目标若是最后一个 ADMIN 也不可降级/删除 */
async function assertAdminTarget(actorId: string, targetId: string) {
  if (actorId === targetId) throw new Error("不能操作自己 self_forbidden");
  const target = await prisma.user.findUnique({ where: { id: targetId } });
  if (!target) throw new Error("用户不存在 user_not_found");
  if (target.role === "ADMIN") {
    const admins = await prisma.user.count({ where: { role: "ADMIN" } });
    if (admins <= 1) throw new Error("至少保留一名管理员 last_admin");
  }
  return target;
}

/** 改角色（ADMIN↔USER） */
export async function setUserRole(actorId: string, targetId: string, role: "ADMIN" | "USER") {
  await assertAdminTarget(actorId, targetId);
  await prisma.user.update({ where: { id: targetId }, data: { role } });
}

/** 重置用户密码（管理员直接设定新密码） */
export async function resetUserPassword(actorId: string, targetId: string, newPassword: string) {
  if (newPassword.length < 8) throw new Error("密码至少 8 位 weak_password");
  await assertAdminTarget(actorId, targetId);
  await prisma.user.update({
    where: { id: targetId },
    data: { passwordHash: await hash(newPassword) },
  });
  // 改密后踢掉该用户全部会话
  await prisma.session.deleteMany({ where: { userId: targetId } });
}

/** 删除用户（级联带走其订阅/物品/邀请等全部数据） */
export async function deleteUser(actorId: string, targetId: string) {
  await assertAdminTarget(actorId, targetId);
  await prisma.user.delete({ where: { id: targetId } });
}
