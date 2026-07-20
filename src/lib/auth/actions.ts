"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  createInvite,
  createSession,
  deleteUser,
  invalidateSession,
  login,
  register,
  resetUserPassword,
  revokeInvite,
  setCanUseScripts,
  setUserRole,
} from "./service";
import { getCurrentUser, SESSION_COOKIE } from "./session";

async function setSessionCookie(sessionId: string, expiresAt: Date) {
  (await cookies()).set(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function loginAction(formData: FormData) {
  const username = String(formData.get("username") ?? "");
  const password = String(formData.get("password") ?? "");
  try {
    const user = await login(username, password);
    const session = await createSession(user.id);
    await setSessionCookie(session.id, session.expiresAt);
  } catch {
    redirect("/login?error=1");
  }
  redirect("/dashboard");
}

export async function registerAction(formData: FormData) {
  const username = String(formData.get("username") ?? "");
  const password = String(formData.get("password") ?? "");
  const invite = String(formData.get("invite") ?? "") || undefined;
  try {
    const user = await register(username, password, invite);
    const session = await createSession(user.id);
    await setSessionCookie(session.id, session.expiresAt);
  } catch {
    redirect("/register?error=1");
  }
  redirect("/dashboard");
}

export async function logoutAction() {
  const store = await cookies();
  const sessionId = store.get(SESSION_COOKIE)?.value;
  if (sessionId) await invalidateSession(sessionId);
  store.delete(SESSION_COOKIE);
  redirect("/login");
}

export async function createInviteAction() {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") throw new Error("forbidden");
  const invite = await createInvite(user.id);
  return invite.token;
}

/** 吊销未使用邀请（仅 ADMIN） */
export async function revokeInviteAction(token: string) {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") throw new Error("forbidden");
  await revokeInvite(token);
  revalidatePath("/settings/users");
}

const assertAdmin = async () => {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") throw new Error("forbidden");
  return user;
};

/** 改角色（仅 ADMIN；不能改自己/最后一个 ADMIN） */
export async function setUserRoleAction(targetId: string, role: "ADMIN" | "USER") {
  const user = await assertAdmin();
  await setUserRole(user.id, targetId, role);
  revalidatePath("/settings/users");
}

/** 重置用户密码（仅 ADMIN；改密后踢掉其全部会话） */
export async function resetUserPasswordAction(targetId: string, newPassword: string) {
  const user = await assertAdmin();
  await resetUserPassword(user.id, targetId, newPassword);
  revalidatePath("/settings/users");
}

/** 删除用户（仅 ADMIN；级联删除其全部数据） */
export async function deleteUserAction(targetId: string) {
  const user = await assertAdmin();
  await deleteUser(user.id, targetId);
  revalidatePath("/settings/users");
}

/** 勾选/取消脚本权限（仅 ADMIN） */
export async function setCanUseScriptsAction(targetId: string, allowed: boolean) {
  const user = await assertAdmin();
  await setCanUseScripts(targetId, allowed);
  revalidatePath("/settings/users");
}
