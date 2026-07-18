import { cookies } from "next/headers";
import { cache } from "react";
import { getSessionUser, type SafeUser } from "./service";

const COOKIE = "subtrace_session";

export const SESSION_COOKIE = COOKIE;

/** 当前登录用户（每个请求缓存一次）；未登录为 null */
export const getCurrentUser = cache(async (): Promise<SafeUser | null> => {
  const sessionId = (await cookies()).get(COOKIE)?.value;
  if (!sessionId) return null;
  return getSessionUser(sessionId);
});
