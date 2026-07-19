// 纯函数缝测试：Webhook 模板渲染与派发（ticket 08）。

import { afterEach, describe, expect, it, vi } from "vitest";
import { deliverWebhook, renderTemplate, type NotifyPayload } from "./dispatch";

const payload: NotifyPayload = {
  title: "[subtrace] 视频 3 天后到期",
  body: "订阅「视频」将于 2026-07-22 到期",
  meta: { subscriptionId: "sub1", subscriptionName: "视频", dueDate: "2026-07-22", dayOffset: 3 },
};

afterEach(() => vi.unstubAllGlobals());

describe("renderTemplate", () => {
  it("替换 title/body/meta 点路径；缺失占位为空串", () => {
    expect(renderTemplate('{"t":"{{title}}","d":"{{meta.dueDate}}","n":{{meta.dayOffset}},"x":"{{meta.miss}}"}', payload)).toBe(
      '{"t":"[subtrace] 视频 3 天后到期","d":"2026-07-22","n":3,"x":""}',
    );
  });
});

describe("deliverWebhook", () => {
  it("默认发 JSON {title,body,meta}，content-type 自动补", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response("ok", { status: 200 });
    });
    const r = await deliverWebhook({ url: "https://h" }, payload);
    expect(r).toEqual({ ok: true });
    expect(calls[0].init.method).toBe("POST");
    expect(JSON.parse(calls[0].init.body as string).meta.subscriptionName).toBe("视频");
    expect((calls[0].init.headers as Record<string, string>)["content-type"]).toBe("application/json");
  });

  it("自定义 method/headers/bodyTemplate 生效；模板时不强塞 content-type", async () => {
    const calls: { init: RequestInit }[] = [];
    vi.stubGlobal("fetch", async (_u: string, init: RequestInit) => {
      calls.push({ init });
      return new Response("ok", { status: 200 });
    });
    await deliverWebhook(
      {
        url: "https://bark.example/push",
        method: "PUT",
        headers: { Authorization: "Bearer k" },
        bodyTemplate: '{"title":"{{title}}","body":"{{body}}"}',
      },
      payload,
    );
    expect(calls[0].init.method).toBe("PUT");
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer k");
    expect(headers["content-type"]).toBeUndefined();
    expect(calls[0].init.body).toBe('{"title":"[subtrace] 视频 3 天后到期","body":"订阅「视频」将于 2026-07-22 到期"}');
  });

  it("非 2xx 返回 HTTP 状态错误", async () => {
    vi.stubGlobal("fetch", async () => new Response("nope", { status: 502 }));
    expect(await deliverWebhook({ url: "https://h" }, payload)).toEqual({ ok: false, error: "HTTP 502" });
  });
});
