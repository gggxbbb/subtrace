// 用量脚本沙箱执行器（ADR-0007）：脚本在 worker_threads 独立 isolate 内的 node:vm 中运行。
// worker 提供可用性边界：同步死循环/微任务饿死/异步悬挂统一由超时 terminate() 熔断，
// 逃逸出 vm 的代码也只触及 worker 线程（process.exit 不会杀死主进程）。
// node:vm + worker 仍不是强安全边界——信任前提是 ADMIN 逐人勾选的可信用户。

import { Worker } from "node:worker_threads";

export interface RunScriptOptions {
  /** 注入沙箱的 env（脚本级密钥），经 structured clone 传入 */
  env: Record<string, unknown>;
  /** 整体墙钟超时（默认 5000ms），到点 terminate */
  timeoutMs?: number;
}

export interface ScriptSuccess {
  ok: true;
  used: number;
  total?: number;
  logs: string[];
}

export interface ScriptFailure {
  ok: false;
  error: string;
  logs: string[];
}

export type ScriptResult = ScriptSuccess | ScriptFailure;

const DEFAULT_TIMEOUT_MS = 5_000;

interface ParsedUsage {
  used: number;
  total?: number;
}

function parseUsage(value: unknown): ParsedUsage | { error: string } {
  const obj = typeof value === "number" ? { used: value } : value;
  if (obj === null || typeof obj !== "object") {
    return { error: `脚本须返回 {used, total?} 或数字，实际返回 ${typeof value}` };
  }
  const { used, total } = obj as { used?: unknown; total?: unknown };
  if (typeof used !== "number" || !Number.isFinite(used) || used < 0) {
    return { error: "used 必须是非负有限数" };
  }
  if (total !== undefined && (typeof total !== "number" || !Number.isFinite(total) || total <= 0)) {
    return { error: "total 存在时必须是正数" };
  }
  return total === undefined ? { used } : { used, total };
}

/**
 * worker 引导代码（内联字符串避免运行时加载文件）：
 * vm 上下文只暴露受限 fetch / console / env；无 require/process/Buffer/dynamic import。
 * fetch 限量读体（1MB 截断即 cancel，不整体入内存）、10s AbortSignal、限 5 次。
 */
const WORKER_SOURCE = String.raw`
const { parentPort, workerData } = require("node:worker_threads");
const vm = require("node:vm");
const { format } = require("node:util");

const logs = [];
const MAX_FETCH_CALLS = 5;
const MAX_RESPONSE_CHARS = 1024 * 1024;
const FETCH_TIMEOUT_MS = 10_000;
let fetchCalls = 0;

const consoleProxy = {};
for (const level of ["log", "info", "warn", "error"]) {
  consoleProxy[level] = (...args) => logs.push("[" + level + "] " + format(...args));
}

function sanitizeInit(init) {
  if (init === null || typeof init !== "object") return {};
  const out = {};
  if (typeof init.method === "string") out.method = init.method;
  if (typeof init.body === "string") out.body = init.body;
  if (init.headers !== null && typeof init.headers === "object") {
    out.headers = {};
    for (const [k, v] of Object.entries(init.headers)) {
      if (typeof v === "string") out.headers[String(k)] = v;
    }
  }
  return out;
}

async function limitedFetch(url, init) {
  fetchCalls += 1;
  if (fetchCalls > MAX_FETCH_CALLS) throw new Error("fetch 调用超过 5 次上限");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(String(url), { ...sanitizeInit(init), signal: ctrl.signal });
    let text = "";
    const reader = res.body && typeof res.body.getReader === "function" ? res.body.getReader() : null;
    if (reader) {
      const dec = new TextDecoder();
      while (text.length <= MAX_RESPONSE_CHARS) {
        const { done, value } = await reader.read();
        if (done) break;
        text += dec.decode(value, { stream: true });
      }
      try { await reader.cancel(); } catch {}
    } else {
      text = await res.text();
    }
    return { status: res.status, text: text.slice(0, MAX_RESPONSE_CHARS) };
  } finally {
    clearTimeout(timer);
  }
}

(async () => {
  // 宿主对象（fetch/console/env）不直接进上下文——经 vm 包装与 JSON 深拷贝，
  // 使脚本可见的一切都是 vm 原生对象，构造器逃逸链终结于 vm Function 并被 codeGeneration 阻断
  const sandbox = {
    __fetch: limitedFetch,
    __console: consoleProxy,
    __env: workerData.env ?? {},
  };
  vm.createContext(sandbox, { codeGeneration: { strings: false, wasm: false } });
  vm.runInContext(
    "(() => {\n" +
    "  const _fetch = globalThis.__fetch, _console = globalThis.__console, _env = globalThis.__env;\n" +
    "  delete globalThis.__fetch; delete globalThis.__console; delete globalThis.__env;\n" +
    "  globalThis.env = JSON.parse(JSON.stringify(_env));\n" +
    "  globalThis.console = {};\n" +
    "  for (const level of ['log', 'info', 'warn', 'error']) { globalThis.console[level] = (...a) => _console[level](...a); }\n" +
    "  globalThis.fetch = async (url, init) => { const result = await _fetch(url, init); return JSON.parse(JSON.stringify(result)); };\n" +
    "})()",
    sandbox,
  );
  let script;
  try {
    script = new vm.Script("(async () => (\n" + workerData.code + "\n))()");
  } catch {
    script = new vm.Script("(async () => {\n" + workerData.code + "\n})()");
  }
  const value = await script.runInContext(sandbox, { timeout: workerData.timeoutMs });
  parentPort.postMessage({ ok: true, value: value === undefined ? null : JSON.parse(JSON.stringify(value)), logs });
})().catch((e) => {
  parentPort.postMessage({ ok: false, error: String((e && e.message) || e), logs });
});
`;

/** 在 worker 沙箱中运行脚本，返回解析后的用量或结构化错误；永不抛出。 */
export async function runScript(code: string, opts: RunScriptOptions): Promise<ScriptResult> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const worker = new Worker(WORKER_SOURCE, {
    eval: true,
    workerData: { code, env: opts.env, timeoutMs },
  });
  try {
    const outcome = await (() => {
      const { promise, resolve } = Promise.withResolvers<{ ok: boolean; value?: unknown; error?: string; logs: string[] }>();
      const killer = setTimeout(() => {
        void worker.terminate().then(() =>
          resolve({ ok: false, error: `执行超时（${timeoutMs}ms 熔断）`, logs: [] }),
        );
      }, timeoutMs + 1000); // 宽限 vm 自身同步超时先报结构化错误
      killer.unref?.();
      worker.once("message", (msg) => {
        clearTimeout(killer);
        resolve(msg);
      });
      worker.once("error", (e) => {
        clearTimeout(killer);
        resolve({ ok: false, error: String(e.message), logs: [] });
      });
      return promise;
    })();
    const logs = Array.isArray(outcome.logs) ? outcome.logs.map(String) : [];
    if (!outcome.ok) return { ok: false, error: outcome.error ?? "未知错误", logs };
    const parsed = parseUsage(outcome.value);
    if ("error" in parsed) return { ok: false, error: parsed.error, logs };
    return { ok: true, used: parsed.used, ...(parsed.total !== undefined ? { total: parsed.total } : {}), logs };
  } finally {
    await worker.terminate();
  }
}
