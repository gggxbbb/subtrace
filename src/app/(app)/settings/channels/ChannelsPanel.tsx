"use client";

// 渠道管理面板（ticket 08）：列表（编辑/启停/试发/删除）+ 新建表单（Webhook / SMTP 邮件）。
// 编辑（ui-polish 05）：行内展开预填表单；类型不可改；pass 留空 = 保留原密码；
// 敏感头（authorization 等）不下发客户端，保存时由服务端自动保留（可同名重填替换）。

import { useState, useTransition } from "react";
import {
  createChannelAction,
  deleteChannelAction,
  testChannelAction,
  toggleChannelAction,
  updateChannelAction,
} from "@/lib/notifications/actions";
import { Panel } from "@/components/te";
import type { ChannelView } from "@/lib/notifications/service";

const inputCls =
  "w-full border border-ink bg-base px-3 py-2 text-sm outline-none focus:bg-surface";
const labelCls = "mb-1 block text-[9px] uppercase tracking-[0.15em] text-muted f-mono";
const btnCls =
  "shrink-0 border border-ink bg-surface px-2.5 py-1.5 text-[9px] uppercase tracking-wider f-mono hover:bg-ink hover:text-surface disabled:opacity-40";

/** headers 对象 ↔ 每行 "Key: Value" 文本 */
function headersToText(headers: unknown): string {
  if (!headers || typeof headers !== "object") return "";
  return Object.entries(headers as Record<string, string>)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
}

function WebhookFields({ config }: { config: Record<string, unknown> }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className={labelCls}>方法</label>
          <select name="method" defaultValue={String(config.method ?? "POST")} className={`${inputCls} f-mono`}>
            {["POST", "PUT", "PATCH"].map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </div>
        <div className="col-span-3">
          <label className={labelCls}>Webhook URL</label>
          <input
            name="url"
            required
            type="url"
            defaultValue={String(config.url ?? "")}
            placeholder="https://…"
            className={`${inputCls} f-mono`}
          />
        </div>
      </div>
      <div>
        <label className={labelCls}>自定义 Headers（可选，每行 Key: Value）</label>
        <textarea
          name="headers"
          rows={2}
          defaultValue={headersToText(config.headers)}
          placeholder={"Authorization: Bearer xxx\nContent-Type: application/json"}
          className={`${inputCls} f-mono`}
        />
        <p className="mt-1 text-[9px] uppercase text-faint f-mono">
          已设的 Authorization 等敏感头不下发显示，保存时自动保留；同名重填可替换
        </p>
      </div>
      <div>
        <label className={labelCls}>Body 模板（可选，留空发默认 JSON）</label>
        <textarea
          name="bodyTemplate"
          rows={3}
          defaultValue={String(config.bodyTemplate ?? "")}
          placeholder={'{"title": "{{title}}", "body": "{{body}}", "url": "https://subtrace.example/subscriptions/{{meta.subscriptionId}}"}'}
          className={`${inputCls} f-mono`}
        />
        <p className="mt-1 text-[9px] uppercase text-faint f-mono">
          占位：{"{{title}} {{body}} {{meta.subscriptionId}} {{meta.subscriptionName}} {{meta.dueDate}} {{meta.dayOffset}}"} ·
          Bark / 企业微信 / ntfy / apprise-api 都能对接
        </p>
      </div>
    </div>
  );
}

function EmailFields({ config, edit }: { config: Record<string, unknown>; edit: boolean }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="col-span-2">
          <label className={labelCls}>SMTP 主机</label>
          <input name="host" required defaultValue={String(config.host ?? "")} placeholder="smtp.qq.com" className={`${inputCls} f-mono`} />
        </div>
        <div>
          <label className={labelCls}>端口</label>
          <input name="port" required type="number" defaultValue={config.port != null ? Number(config.port) : 465} className={`${inputCls} f-mono`} />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <label className={labelCls}>账号（可选）</label>
          <input name="user" autoComplete="off" defaultValue={String(config.user ?? "")} className={`${inputCls} f-mono`} />
        </div>
        <div>
          <label className={labelCls}>密码 / 授权码</label>
          <input
            name="pass"
            type="password"
            autoComplete="new-password"
            placeholder={edit ? "留空 = 保留原密码" : ""}
            className={`${inputCls} f-mono`}
          />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <label className={labelCls}>发件人</label>
          <input name="from" required defaultValue={String(config.from ?? "")} placeholder="subtrace@example.com" className={`${inputCls} f-mono`} />
        </div>
        <div>
          <label className={labelCls}>收件人</label>
          <input name="to" required defaultValue={String(config.to ?? "")} placeholder="me@example.com" className={`${inputCls} f-mono`} />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="secure" defaultChecked={config.secure !== false} className="h-4 w-4 accent-ink" />
        SSL/TLS（465 端口勾选；587 STARTTLS 不勾）
      </label>
    </div>
  );
}

function ChannelRow({ channel }: { channel: ChannelView }) {
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const summary =
    channel.kind === "WEBHOOK"
      ? String(channel.config.url ?? "")
      : `${channel.config.host}:${channel.config.port} → ${channel.config.to}`;

  return (
    <div className="border-b border-line last:border-0">
      <div className="flex items-center gap-3 px-4 py-3">
        <span
          className={`inline-block h-2 w-2 shrink-0 rounded-full ${channel.enabled ? "bg-accent-hover" : "bg-line-strong"}`}
        />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium" title={channel.name}>
            {channel.name}
            <span className="ml-2 text-[9px] uppercase text-faint f-mono">{channel.kind}</span>
          </div>
          <div className="truncate text-[10px] text-muted f-mono">{summary}</div>
          {testResult && <div className="mt-0.5 text-[10px] f-mono">{testResult}</div>}
        </div>
        <button
          disabled={pending}
          onClick={() => setEditing((v) => !v)}
          className={btnCls}
        >
          {editing ? "收起" : "编辑"}
        </button>
        <button
          disabled={pending}
          onClick={() =>
            start(async () => {
              setTestResult(null);
              const r = await testChannelAction(channel.id);
              setTestResult(r.ok ? "✓ 测试消息已发送" : `✗ ${r.error}`);
            })
          }
          className={btnCls}
        >
          试发
        </button>
        <button
          disabled={pending}
          onClick={() => start(() => toggleChannelAction(channel.id, !channel.enabled))}
          className={btnCls}
        >
          {channel.enabled ? "停用" : "启用"}
        </button>
        <button
          disabled={pending}
          onClick={() => start(() => deleteChannelAction(channel.id))}
          className="shrink-0 border border-ink bg-surface px-2.5 py-1.5 text-[9px] uppercase tracking-wider text-[#ef4444] f-mono hover:bg-[#ef4444] hover:text-white disabled:opacity-40"
        >
          删除
        </button>
      </div>

      {editing && (
        <form
          action={(fd) =>
            start(async () => {
              await updateChannelAction(channel.id, fd);
              setEditing(false);
            })
          }
          className="space-y-4 border-t border-line bg-base/40 p-4"
        >
          <input type="hidden" name="kind" value={channel.kind} />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className={labelCls}>名称</label>
              <input name="name" required defaultValue={channel.name} className={inputCls} />
            </div>
            <div className="flex flex-col">
              <label className={labelCls}>类型</label>
              <div className="flex flex-1 items-center border border-line-strong bg-band px-3 py-2 text-[10px] uppercase tracking-wider text-muted f-mono">
                {channel.kind === "WEBHOOK" ? "Webhook（不可改）" : "SMTP 邮件（不可改）"}
              </div>
            </div>
          </div>
          {channel.kind === "WEBHOOK" ? (
            <WebhookFields config={channel.config} />
          ) : (
            <EmailFields config={channel.config} edit />
          )}
          <div className="flex gap-2">
            <button
              disabled={pending}
              className="border border-ink bg-ink px-4 py-2 text-[10px] uppercase tracking-wider text-surface f-mono hover:bg-accent-hover hover:border-accent-hover disabled:opacity-40"
            >
              保存修改
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => setEditing(false)}
              className="border border-ink bg-surface px-4 py-2 text-[10px] uppercase tracking-wider f-mono hover:bg-ink hover:text-surface disabled:opacity-40"
            >
              取消
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

export function ChannelsPanel({ channels }: { channels: ChannelView[] }) {
  const [kind, setKind] = useState<"WEBHOOK" | "EMAIL">("WEBHOOK");
  const [pending, start] = useTransition();

  return (
    <div className="space-y-4">
      <Panel index="01" title={`已配置渠道 / ${channels.length}`}>
        {channels.length === 0 && (
          <div className="px-4 py-6 text-center text-[11px] uppercase text-faint f-mono">
            还没有通知渠道，在下方添加
          </div>
        )}
        {channels.map((c) => (
          <ChannelRow key={c.id} channel={c} />
        ))}
      </Panel>

      <Panel index="02" title="添加渠道">
        <form
          action={(fd) => start(() => createChannelAction(fd))}
          className="space-y-4 p-4"
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className={labelCls}>名称</label>
              <input name="name" required placeholder="我的 Bark / 邮箱" className={inputCls} />
            </div>
            <div className="flex flex-col">
              <label className={labelCls}>类型</label>
              <div className="flex flex-1 border border-ink">
                {(["WEBHOOK", "EMAIL"] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setKind(k)}
                    className={`flex flex-1 items-center justify-center px-3 py-2 text-[10px] uppercase tracking-wider f-mono ${
                      kind === k ? "bg-ink text-surface" : "bg-surface hover:bg-ink/5"
                    }`}
                  >
                    {k === "WEBHOOK" ? "Webhook" : "SMTP 邮件"}
                  </button>
                ))}
              </div>
              <input type="hidden" name="kind" value={kind} />
            </div>
          </div>

          {kind === "WEBHOOK" ? <WebhookFields config={{}} /> : <EmailFields config={{}} edit={false} />}

          <button
            disabled={pending}
            className="border border-ink bg-ink px-4 py-2 text-[10px] uppercase tracking-wider text-surface f-mono hover:bg-accent-hover hover:border-accent-hover disabled:opacity-40"
          >
            添加渠道
          </button>
        </form>
      </Panel>
    </div>
  );
}
