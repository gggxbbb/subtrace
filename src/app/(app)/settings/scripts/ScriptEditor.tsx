"use client";

// 脚本编辑器（ticket 03）：选订阅、写脚本、cron（档位预填+校验）、env、保存/清除/立即运行。

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Led } from "@/components/te";
import { runScriptNowAction, saveScriptAction } from "@/lib/scripts/actions";
import type { ScriptSubView } from "@/lib/scripts/service";

const inputCls =
  "w-full border border-black bg-[#E4E3E0] px-3 py-2 text-sm outline-none focus:bg-white";
const labelCls = "mb-1 block text-[9px] uppercase tracking-[0.15em] text-neutral-500 f-mono";

const PRESETS: { label: string; cron: string }[] = [
  { label: "每小时", cron: "0 * * * *" },
  { label: "每 6 小时", cron: "0 */6 * * *" },
  { label: "每天 8 点", cron: "0 8 * * *" },
];

const DEFAULT_SCRIPT = `// 可用：fetch(url, init?)（限 5 次/1MB/10s）、console.log、env（下方密钥）
// 返回 { used, total? }（total 可省略）；示例：
const res = await fetch("https://example.com/api/usage", {
  headers: { authorization: \`Bearer \${env.token}\` },
});
const data = JSON.parse(res.text);
return { used: data.used, total: data.total };`;

export interface ScriptLastRun {
  status: string;
  startedAt: string;
  message: string | null;
}

export function ScriptEditor({
  subs,
  lastRuns,
  selectedId,
}: {
  subs: ScriptSubView[];
  lastRuns: Record<string, ScriptLastRun | null>;
  selectedId: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const initial = subs.find((s) => s.id === selectedId) ?? subs[0];
  const [subId, setSubId] = useState(initial?.id ?? "");
  const sub = subs.find((s) => s.id === subId);
  const [script, setScript] = useState(sub?.script ?? DEFAULT_SCRIPT);
  const [cron, setCron] = useState(sub?.scriptCron ?? "0 */6 * * *");
  const [env, setEnv] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const lastRun = lastRuns[subId] ?? null;

  const pick = (id: string) => {
    const s = subs.find((x) => x.id === id);
    setSubId(id);
    setScript(s?.script ?? DEFAULT_SCRIPT);
    setCron(s?.scriptCron ?? "0 */6 * * *");
    setEnv("");
    setResult(null);
  };

  return (
    <div className="space-y-4">
      <form action={(fd) => start(async () => { await saveScriptAction(fd); router.refresh(); })} className="space-y-4">
        <input type="hidden" name="subscriptionId" value={subId} />
        <div>
          <label className={labelCls}>订阅（仅额度型）</label>
          <select value={subId} onChange={(e) => pick(e.target.value)} className={inputCls}>
            {subs.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}{s.script ? "（已启用脚本）" : ""}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>脚本（JS，返回 {"{used, total?}"}）</label>
          <textarea
            name="script"
            rows={10}
            value={script}
            onChange={(e) => setScript(e.target.value)}
            className={`${inputCls} f-mono text-[12px] leading-relaxed`}
            spellCheck={false}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>cron（北京时间）</label>
            <input name="scriptCron" value={cron} onChange={(e) => setCron(e.target.value)} className={`${inputCls} f-mono`} />
            <div className="mt-1.5 flex gap-1.5">
              {PRESETS.map((p) => (
                <button
                  key={p.cron}
                  type="button"
                  onClick={() => setCron(p.cron)}
                  className="border border-black bg-white px-2 py-0.5 text-[9px] uppercase f-mono hover:bg-black hover:text-white"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className={labelCls}>env 密钥（JSON 对象{sub?.hasEnv ? "；已配置，留空保持不变" : ""}）</label>
            <textarea
              name="scriptEnv"
              rows={3}
              value={env}
              onChange={(e) => setEnv(e.target.value)}
              placeholder={sub?.hasEnv ? "已配置（不回显）" : '{"token": "..."}'}
              className={`${inputCls} f-mono text-[12px]`}
              spellCheck={false}
            />
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <button disabled={pending} className="border border-black bg-black px-4 py-2 text-[10px] uppercase tracking-wider text-white f-mono hover:bg-[#FF6B00] hover:border-[#FF6B00] disabled:opacity-40">
            保存
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const fd = new FormData();
                fd.set("subscriptionId", subId);
                fd.set("script", "");
                fd.set("scriptCron", "");
                await saveScriptAction(fd);
                router.refresh();
              })
            }
            className="border border-black bg-white px-4 py-2 text-[10px] uppercase tracking-wider text-[#ef4444] f-mono hover:bg-[#ef4444] hover:text-white disabled:opacity-40"
          >
            清除脚本
          </button>
          {sub?.script && (
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  setResult(null);
                  const r = await runScriptNowAction(subId);
                  setResult(`${r.ok ? "✓" : "✗"} ${r.message}`);
                })
              }
              className="border border-black bg-white px-4 py-2 text-[10px] uppercase tracking-wider f-mono hover:bg-black hover:text-white disabled:opacity-40"
            >
              立即运行
            </button>
          )}
          {lastRun && (
            <span className="ml-auto flex items-center gap-1.5 text-[10px] text-neutral-500 f-mono">
              <Led color={lastRun.status === "OK" ? "#22c55e" : "#ef4444"} />
              上次 {lastRun.startedAt}{lastRun.message ? ` · ${lastRun.message.slice(0, 80)}` : ""}
            </span>
          )}
        </div>
        {result && <div className="whitespace-pre-wrap border border-black bg-[#E4E3E0] px-3 py-2 text-[11px] f-mono">{result}</div>}
      </form>
    </div>
  );
}
