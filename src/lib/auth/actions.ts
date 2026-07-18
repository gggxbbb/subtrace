"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  createInvite,
  createSession,
  invalidateSession,
  login,
  register,
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
