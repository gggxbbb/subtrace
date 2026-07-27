// 仓储缝测试：通知渠道服务（ticket 08）。

import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../db";
import {
  createChannel,
  deleteChannel,
  listChannels,
  setChannelEnabled,
  testChannel,
  updateChannel,
} from "./service";

let ownerId: string;

beforeEach(async () => {
  await prisma.reminderDelivery.deleteMany();
  await prisma.notificationChannel.deleteMany();
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
  ownerId = (await prisma.user.create({ data: { username: "me", passwordHash: "x" } })).id;
});

describe("渠道 CRUD", () => {
  it("创建/列表/启停/删除；列表视图脱敏（pass、authorization 不下发）", async () => {
    await createChannel(ownerId, {
      kind: "WEBHOOK",
      name: "Bark",
      config: { url: "https://bark.example/push", headers: { Authorization: "Bearer k", "X-Custom": "v" } },
    });
    await createChannel(ownerId, {
      kind: "EMAIL",
      name: "邮箱",
      config: { host: "smtp.qq.com", port: 465, secure: true, user: "u", pass: "secret", from: "a@b.c", to: "d@e.f" },
    });

    const list = await listChannels(ownerId);
    expect(list.map((c) => c.name)).toEqual(["Bark", "邮箱"]);
    expect(list[0].config.url).toBe("https://bark.example/push");
    expect((list[0].config.headers as Record<string, string>).Authorization).toBeUndefined();
    expect((list[0].config.headers as Record<string, string>)["X-Custom"]).toBe("v");
    expect(list[1].config.pass).toBeUndefined();
    expect(list[1].config.host).toBe("smtp.qq.com");
    // 库里仍是完整配置
    const raw = await prisma.notificationChannel.findFirst({ where: { name: "邮箱" } });
    expect(JSON.parse(raw!.config).pass).toBe("secret");

    await setChannelEnabled(ownerId, list[0].id, false);
    expect((await listChannels(ownerId))[0].enabled).toBe(false);

    await deleteChannel(ownerId, list[0].id);
    expect((await listChannels(ownerId)).map((c) => c.name)).toEqual(["邮箱"]);
  });

  it("他用户渠道不可见不可操作", async () => {
    const other = (await prisma.user.create({ data: { username: "other", passwordHash: "x" } })).id;
    await createChannel(other, { kind: "WEBHOOK", name: "别人的", config: { url: "https://x" } });
    expect(await listChannels(ownerId)).toEqual([]);
    const foreign = (await listChannels(other))[0];
    await setChannelEnabled(ownerId, foreign.id, false);
    await deleteChannel(ownerId, foreign.id);
    expect((await listChannels(other))[0].enabled).toBe(true);
  });
});

describe("updateChannel", () => {
  it("更新名称与配置；enabled 与 kind 不被触碰", async () => {
    await createChannel(ownerId, {
      kind: "WEBHOOK",
      name: "Bark",
      config: { url: "https://old.example", method: "POST" },
    });
    const id = (await listChannels(ownerId))[0].id;
    await setChannelEnabled(ownerId, id, false);

    await updateChannel(ownerId, id, { name: "Bark2", config: { url: "https://new.example" } });

    const raw = (await prisma.notificationChannel.findFirst({ where: { id } }))!;
    expect(raw.name).toBe("Bark2");
    expect(JSON.parse(raw.config).url).toBe("https://new.example");
    expect(raw.enabled).toBe(false); // 启停状态保留
    expect(raw.kind).toBe("WEBHOOK"); // 类型不可变
  });

  it("pass 缺席 = 保留原密码；显式提供 = 替换", async () => {
    await createChannel(ownerId, {
      kind: "EMAIL",
      name: "邮箱",
      config: { host: "smtp.qq.com", port: 465, secure: true, user: "u", pass: "secret", from: "a@b.c", to: "d@e.f" },
    });
    const id = (await listChannels(ownerId))[0].id;

    // 编辑提交不带 pass（客户端根本拿不到）→ 原密码保留
    await updateChannel(ownerId, id, {
      name: "邮箱",
      config: { host: "smtp.new.com", port: 587, secure: false, from: "a@b.c", to: "d@e.f" },
    });
    let cfg = JSON.parse((await prisma.notificationChannel.findFirst({ where: { id } }))!.config);
    expect(cfg.host).toBe("smtp.new.com");
    expect(cfg.pass).toBe("secret");

    // 显式填新密码 → 替换
    await updateChannel(ownerId, id, { name: "邮箱", config: { ...cfg, pass: "new-secret" } });
    cfg = JSON.parse((await prisma.notificationChannel.findFirst({ where: { id } }))!.config);
    expect(cfg.pass).toBe("new-secret");
  });

  it("敏感头缺席 = 保留；同名重填 = 替换；非敏感头正常随表单覆盖", async () => {
    await createChannel(ownerId, {
      kind: "WEBHOOK",
      name: "Bark",
      config: { url: "https://x", headers: { Authorization: "Bearer k", "X-Custom": "v" } },
    });
    const id = (await listChannels(ownerId))[0].id;

    // 表单只回了非敏感头 → Authorization 自动保留
    await updateChannel(ownerId, id, { name: "Bark", config: { url: "https://x", headers: { "X-Custom": "v2" } } });
    let cfg = JSON.parse((await prisma.notificationChannel.findFirst({ where: { id } }))!.config);
    expect(cfg.headers.Authorization).toBe("Bearer k");
    expect(cfg.headers["X-Custom"]).toBe("v2");

    // 显式重填敏感头 → 替换
    await updateChannel(ownerId, id, { name: "Bark", config: { url: "https://x", headers: { Authorization: "Bearer k2" } } });
    cfg = JSON.parse((await prisma.notificationChannel.findFirst({ where: { id } }))!.config);
    expect(cfg.headers.Authorization).toBe("Bearer k2");
  });

  it("非本人渠道拒绝更新", async () => {
    const other = (await prisma.user.create({ data: { username: "other", passwordHash: "x" } })).id;
    await createChannel(other, { kind: "WEBHOOK", name: "别人的", config: { url: "https://x" } });
    const foreign = (await listChannels(other))[0];
    await expect(updateChannel(ownerId, foreign.id, { name: "劫持", config: { url: "https://evil" } })).rejects.toThrow();
    expect(JSON.parse((await prisma.notificationChannel.findFirst({ where: { id: foreign.id } }))!.config).url).toBe("https://x");
  });
});

describe("testChannel", () => {
  it("配置损坏返回错误而不抛异常", async () => {
    const c = await prisma.notificationChannel.create({
      data: { userId: ownerId, kind: "WEBHOOK", name: "坏", config: "not-json" },
    });
    expect(await testChannel(ownerId, c.id)).toEqual({ ok: false, error: "渠道配置损坏" });
  });

  it("渠道不存在 / 非本人", async () => {
    expect(await testChannel(ownerId, "missing")).toEqual({ ok: false, error: "渠道不存在" });
  });
});
