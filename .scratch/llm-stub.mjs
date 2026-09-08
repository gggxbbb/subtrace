// LLM stub for ai-digest smoke: POST /chat/completions → canned digest JSON; counts calls.
// Mode via env STUB_MODE: "ok" (default) | "500".
import { createServer } from "node:http";
let count = 0;
const server = createServer((req, res) => {
  if (req.method === "POST" && req.url === "/chat/completions") {
    count++;
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      if (process.env.STUB_MODE === "500") {
        res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "stub failure" }));
        return;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({
          line: "冒烟摘要：1 个订阅即将到期，本月支出为零。",
          detail: "· AI摘要冒烟订阅 将于 11 天后自动扣费 ¥68\n· 本月支出 ¥0，年度累计 ¥567.26",
        }) } }],
      }));
    });
    return;
  }
  if (req.url === "/count") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ count }));
    return;
  }
  res.writeHead(404); res.end();
});
server.listen(3999, "127.0.0.1", () => console.log("stub listening 3999"));
