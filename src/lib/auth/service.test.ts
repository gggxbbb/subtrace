// 仓储缝测试：认证与邀请制（ticket 02），对独立测试 SQLite 实测。

import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../db";
import {
  createInvite,
  createSession,
  getSessionUser,
  invalidateSession,
  login,
  register,
} from "./service";

beforeEach(async () => {
  await prisma.session.deleteMany();
  await prisma.invite.deleteMany();
  await prisma.user.deleteMany();
});

describe("注册（邀请制）", () => {
  it("空库时首个注册的用户自动成为 ADMIN，无需邀请", async () => {
    const user = await register("gggxbbb", "secret-password");
    expect(user.role).toBe("ADMIN");
    expect(user.username).toBe("gggxbbb");
  });

  it("密码以 argon2 哈希存储，不落明文", async () => {
    const user = await register("gggxbbb", "secret-password");
    const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(row.passwordHash).not.toContain("secret-password");
    expect(row.passwordHash).toMatch(/^\$argon2/);
  });

  it("非空库时无邀请 token 拒绝注册", async () => {
    await register("first", "secret-password");
    await expect(register("second", "secret-password")).rejects.toThrow(/invite|邀请/i);
  });

  it("凭有效邀请可注册为 USER，邀请随即作废", async () => {
    const admin = await register("admin", "secret-password");
    const invite = await createInvite(admin.id);
    const user = await register("second", "secret-password", invite.token);
    expect(user.role).toBe("USER");
    await expect(register("third", "secret-password", invite.token)).rejects.toThrow(/invite|邀请/i);
  });

  it("过期邀请不可用", async () => {
    const admin = await register("admin", "secret-password");
    const invite = await createInvite(admin.id, new Date(Date.now() - 1000));
    await expect(register("second", "secret-password", invite.token)).rejects.toThrow(/invite|邀请/i);
  });

  it("用户名重复拒绝注册", async () => {
    await register("gggxbbb", "secret-password");
    const admin = await prisma.user.findUniqueOrThrow({ where: { username: "gggxbbb" } });
    const invite = await createInvite(admin.id);
    await expect(register("gggxbbb", "other-password", invite.token)).rejects.toThrow(/username|用户名/i);
  });
});

describe("登录与会话", () => {
  it("正确密码登录成功，错误密码拒绝", async () => {
    await register("gggxbbb", "secret-password");
    await expect(login("gggxbbb", "secret-password")).resolves.toMatchObject({ username: "gggxbbb" });
    await expect(login("gggxbbb", "wrong-password")).rejects.toThrow(/credentials|密码/i);
  });

  it("会话有效期内可取回用户，注销后失效", async () => {
    const user = await register("gggxbbb", "secret-password");
    const session = await createSession(user.id);
    expect((await getSessionUser(session.id))?.id).toBe(user.id);
    await invalidateSession(session.id);
    expect(await getSessionUser(session.id)).toBeNull();
  });

  it("过期会话视为无效", async () => {
    const user = await register("gggxbbb", "secret-password");
    const session = await createSession(user.id, new Date(Date.now() - 1000));
    expect(await getSessionUser(session.id)).toBeNull();
  });
});
