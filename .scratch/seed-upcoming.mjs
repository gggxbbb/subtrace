import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const Database = require("better-sqlite3");
const { randomBytes } = require("node:crypto");
const db = new Database("data/subtrace.db");
const user = db.prepare("SELECT id FROM User WHERE username = 'gggxbbb'").get();
const existing = db.prepare("SELECT id FROM Subscription WHERE ownerId = ? AND name = 'AI摘要冒烟订阅'").get(user.id);
if (existing) { console.log("exists", existing.id); }
else {
  const id = "smk" + randomBytes(8).toString("hex");
  const anchor = new Date(); anchor.setDate(anchor.getDate() + 10);
  db.prepare(`INSERT INTO Subscription (id, ownerId, name, trackingMode, cycleKind, cycleUnit, cycleCount, anchorDate, listPrice, listCurrency, listPriceBase, autoRenew, status, startDate)
    VALUES (?, ?, 'AI摘要冒烟订阅', 'CYCLE', 'CALENDAR', 'MONTH', 1, ?, 68, 'CNY', 68, 1, 'ACTIVE', ?)`)
    .run(id, user.id, anchor.toISOString(), new Date().toISOString());
  console.log("created", id, anchor.toISOString());
}
db.close();
