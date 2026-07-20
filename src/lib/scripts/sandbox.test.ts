// 纯函数缝测试：脚本沙箱（ADR-0007，worker_threads + node:vm）。
// fetch 行为用本地 HTTP 服务器实测，不 mock。

import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runScript } from "./sandbox";

let server: Server;
let baseUrl: string;
let hitCount = 0;

beforeAll(async () => {
  server = createServer((req, res) => {
    hitCount += 1;
    if (req.url === "/json") {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ used: 123.4, total: 1024 }));
    } else if (req.url === "/big") {
      res.end("x".repeat(2 * 1024 * 1024)); // 2MB，验证 1MB 截断
    } else if (req.url === "/slow") {
      // 集成例外（ts-no-test-timers）：故意用真实时钟模拟超慢上游，测 fetch/整体熔断
      setTimeout(() => res.end("late"), 15_000);
    } else if (req.url === "/echo") {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => res.end(JSON.stringify({ method: req.method, body, auth: req.headers.authorization })));
    } else {
      res.statusCode = 404;
      res.end("nf");
    }
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address();
  baseUrl = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
});

afterAll(async () => {
  await new Promise((r) => server.close(r));
});

describe("返回值解析", () => {
  it("对象 {used, total} / 裸数字 / 表达式与函数体两种写法", async () => {
    expect(await runScript("({used: 42, total: 100})", { env: {} })).toMatchObject({ ok: true, used: 42, total: 100 });
    expect(await runScript("42", { env: {} })).toEqual({ ok: true, used: 42, logs: [] });
    expect(await runScript("const x = 7;\nreturn { used: x * 2 };", { env: {} })).toMatchObject({ ok: true, used: 14 });
  });

  it.each([
    ["'hello'", "须返回"],
    ["({used: -1})", "非负"],
    ["({used: NaN})", "非负"],
    ["({used: 1, total: 0})", "正数"],
    ["null", "须返回"],
  ])("坏返回值 %s 报结构化错误", async (code, msg) => {
    const r = await runScript(code, { env: {} });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain(msg);
  });
});

describe("沙箱隔离", () => {
  it("无 require/process/Buffer，禁止 eval/Function 代码生成", async () => {
    const r = await runScript(
      "({p: typeof process, r: typeof require, b: typeof Buffer, e: (() => { try { return eval('1'); } catch { return 'blocked'; } })() })",
      { env: {} },
    );
    expect(r.ok).toBe(false); // used 是对象不是数字 → 解析失败，但内容要先拿到
    // 换种方式：日志输出
    const r2 = await runScript(
      "console.log(typeof process, typeof require, typeof Buffer);\nreturn 42;",
      { env: {} },
    );
    expect(r2).toMatchObject({ ok: true, used: 42 });
    expect(r2.ok && r2.logs[0]).toContain("undefined undefined undefined");
  });

  it("构造器逃逸链被 codeGeneration 阻断", async () => {
    const r = await runScript(
      "try { fetch.constructor.constructor('return process')(); console.log('ESCAPED'); } catch (e) { console.log('blocked:', e.message); }\nreturn 42;",
      { env: {} },
    );
    expect(r).toMatchObject({ ok: true, used: 42 });
    expect(r.ok && r.logs[0]).toContain("blocked");
    expect(r.ok && r.logs[0]).not.toContain("ESCAPED");
  });
});

describe("console 与 env", () => {
  it("console 各级别收集进 logs；env 注入可见", async () => {
    const r = await runScript(
      "console.log('token =', env.token);\nconsole.warn('注意', 1);\nreturn { used: 5 };",
      { env: { token: "secret-1" } },
    );
    expect(r).toMatchObject({ ok: true, used: 5 });
    if (r.ok) {
      expect(r.logs.some((l) => l.includes("token = secret-1"))).toBe(true);
      expect(r.logs.some((l) => l.includes("[warn] 注意 1"))).toBe(true);
    }
  });
});

describe("受限 fetch", () => {
  it("正常请求拿到 status 与 text", async () => {
    const r = await runScript(
      `const res = await fetch("${baseUrl}/json");\nconst data = JSON.parse(res.text);\nreturn { used: data.used, total: data.total };`,
      { env: {} },
    );
    expect(r).toMatchObject({ ok: true, used: 123.4, total: 1024 });
  });

  it("method/headers/body 透传", async () => {
    const r = await runScript(
      `const res = await fetch("${baseUrl}/echo", { method: "POST", headers: { authorization: "Bearer k" }, body: "payload" });\nconst d = JSON.parse(res.text);\nconsole.log(d.method, d.body, d.auth);\nreturn 1;`,
      { env: {} },
    );
    expect(r.ok && r.logs[0]).toContain("POST payload Bearer k");
  });

  it("1MB 截断", async () => {
    const r = await runScript(
      `const res = await fetch("${baseUrl}/big");\nreturn res.text.length;`,
      { env: {} },
    );
    expect(r).toMatchObject({ ok: true, used: 1024 * 1024 });
  });

  it("超过 5 次调用抛错", async () => {
    hitCount = 0;
    const r = await runScript(
      `for (let i = 0; i < 6; i++) { await fetch("${baseUrl}/json"); }\nreturn 1;`,
      { env: {} },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("5 次");
  });
});

describe("熔断", () => {
  // 集成例外（ts-no-test-timers）：熔断语义本身就是真实墙钟行为，fake timers 无法驱动 worker 线程
  it("同步死循环：vm 超时返回结构化错误，主进程存活", async () => {
    const r = await runScript("while (true) {}", { env: {}, timeoutMs: 500 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/超时|timed out/i);
  }, 15_000);

  it("微任务死循环：worker terminate 兜底，主进程不被饿死", async () => {
    const r = await runScript("Promise.resolve().then(function loop() { Promise.resolve().then(loop); });\nawait new Promise(() => {});", {
      env: {},
      timeoutMs: 500,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("熔断");
  }, 15_000);

  it("异步悬挂（慢响应）：整体超时熔断", async () => {
    const r = await runScript(`await fetch("${baseUrl}/slow");\nreturn 1;`, { env: {}, timeoutMs: 500 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/超时|熔断|abort/i);
  }, 20_000);

  it("脚本抛异常返回错误不抛出", async () => {
    const r = await runScript("throw new Error('自己炸');", { env: {} });
    expect(r).toEqual({ ok: false, error: "自己炸", logs: [] });
  });

  it("语法错误返回错误不抛出", async () => {
    const r = await runScript("(((", { env: {} });
    expect(r.ok).toBe(false);
  });
});
