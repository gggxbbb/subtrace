# 用量脚本：node:vm 沙箱 + 信任用户标记

用户可为额度型订阅编写 JS 脚本，定时从产品 API 拉取当前用量并写入用量快照。脚本在 **worker_threads 独立 isolate 内的 node:vm** 中执行：vm 上下文只暴露受限 fetch（10s 超时、1MB 限量读、每次运行限 5 次）、console（收日志）与 env（脚本级 JSON 密钥，脱敏回显），宿主对象经 vm 侧包装 + JSON 深拷贝后才可见（构造器逃逸链终结于 vm Function 并被 codeGeneration 阻断）；返回值按发放形态分裂（ADR-0012）：周期重置返回 `{used, total?}`（兼容裸数字）写已用快照；包叠加返回 `{remaining}` 写剩余快照——均写为 TOTAL 快照（source=SCRIPT），形态与返回值不匹配时拒绝执行。超时熔断在 worker 层 terminate——同步死循环、微任务饿死、异步悬挂都能杀掉，且不会拖死主进程。

node:vm（即便叠加 worker 与 codeGeneration 限制）**仍不是强安全边界**（残余逃逸面存在，逃逸后也仅触及 worker 线程），我们接受这一点，因为：单实例自部署（ADR-0005）下脚本作者就是服务器主人的家庭成员，且功能由 ADMIN 逐人勾选"信任用户"开放，UI 与 action 双层校验。SSRF 不做限制——访问内网设备（路由器/NAS）恰是正当场景；真正的防线是信任标记。若未来开放给不受信任的用户，必须换强隔离方案（独立进程/容器/wasm）。

脚本失败不重试：用量快照幂等，等下一个 cron 触发点自然愈合。
