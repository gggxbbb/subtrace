# 02 — 沙箱执行器

**What to build:** node:vm 脚本执行器纯函数：输入脚本源码与 {env, fetcher}，在沙箱中运行并返回解析后的用量 `{used, total?}`（兼容裸数字）、console 日志、错误或超时标记。沙箱只暴露受限 fetch（10s 超时、响应 1MB 截断、每次运行限 5 次调用）、console 与 env；无 require/process/Buffer；vm 级超时熔断。不涉及数据库与调度。

**Blocked by:** None — can start immediately

**Status:** resolved

- [x] 正常脚本返回 `{used, total?}`；裸数字按 `{used}` 处理；非对象/非数字返回视为错误
- [x] 沙箱内无 require/process/Buffer/globalThis 逃逸面（基础断言）
- [x] fetch 超时熔断、1MB 截断、超过 5 次调用抛错
- [x] console.log 等被收集进返回的日志
- [x] 脚本抛异常与 vm 超时均返回结构化错误（不抛出）

## Answer

实现于 `src/lib/scripts/sandbox.ts`：`runScript` 用 node:vm 执行包装为 async IIFE 的用户脚本（顶层兼容裸表达式与 return），沙箱只暴露受限 fetch（5 次上限、1MB 截断、默认实现带 10s AbortSignal）、console（收日志）与 env；vm timeout + 竞速计时器双熔断，所有异常归一为结构化 `ScriptResult`，不抛出。24 条测试全部通过（`pnpm test src/lib/scripts/sandbox.test.ts`），tsc 无类型错误。
