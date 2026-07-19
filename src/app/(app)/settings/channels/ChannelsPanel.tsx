"use client";

// 渠道管理面板（ticket 08）：列表（启停/试发/删除）+ 新建表单（Webhook / SMTP 邮件）。

import { useState, useTransition } from "react";
import {
  createChannelAction,
  deleteChannelAction,
  testChannelAction,
  toggleChannelAction,
} from "@/lib/notifications/actions";
import { Panel } from "@/components/te";
import type { ChannelView } from "@/lib/notifications/service";

const inputCls =
  "w-full border border-black bg-[#E4E3E0] px-3 py-2 text-sm outline-none focus:bg-white";
const labelCls = "mb-1 block text-[9px] uppercase tracking-[0.15em] text-neutral-500 f-mono";

function ChannelRow({ channel }: { channel: ChannelView }) {
  const [pending, start] = useTransition();
  const [testResult, setTestResult] = useState<string | null>(null);
  const summary =
    channel.kind === "WEBHOOK"
      ? String(channel.config.url ?? "")
      : `${channel.config.host}:${channel.config.port} → ${channel.config.to}`;

  return (
    <div className="flex items-center gap-3 border-b border-neutral-200 px-4 py-3 last:border-0">
      <span
        className={`inline-block h-2 w-2 rounded-full ${channel.enabled ? "bg-[#FF6B00]" : "bg-neutral-300"}`}
      />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">
          {channel.name}
          <span className="ml-2 text-[9px] uppercase text-neutral-400 f-mono">{channel.kind}</span>
        </div>
        <div className="truncate text-[10px] text-neutral-500 f-mono">{summary}</div>
        {testResult && <div className="mt-0.5 text-[10px] f-mono">{testResult}</div>}
      </div>
      <button
        disabled={pending}
        onClick={() =>
          start(async () => {
            setTestResult(null);
            const r = await testChannelAction(channel.id);
            setTestResult(r.ok ? "✓ 测试消息已发送" : `✗ ${r.error}`);
          })
        }
        className="border border-black bg-white px-2.5 py-1.5 text-[9px] uppercase tracking-wider f-mono hover:bg-black hover:text-white disabled:opacity-40"
      >
        试发
      </button>
      <button
        disabled={pending}
        onClick={() => start(() => toggleChannelAction(channel.id, !channel.enabled))}
        className="border border-black bg-white px-2.5 py-1.5 text-[9px] uppercase tracking-wider f-mono hover:bg-black hover:text-white disabled:opacity-40"
      >
        {channel.enabled ? "停用" : "启用"}
      </button>
      <button
        disabled={pending}
        onClick={() => start(() => deleteChannelAction(channel.id))}
        className="border border-black bg-white px-2.5 py-1.5 text-[9px] uppercase tracking-wider text-[#ef4444] f-mono hover:bg-[#ef4444] hover:text-white disabled:opacity-40"
      >
        删除
      </button>
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
          <div className="px-4 py-6 text-center text-[11px] uppercase text-neutral-400 f-mono">
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
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>名称</label>
              <input name="name" required placeholder="我的 Bark / 邮箱" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>类型</label>
              <div className="flex border border-black">
                {(["WEBHOOK", "EMAIL"] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setKind(k)}
                    className={`flex-1 px-3 py-2 text-[10px] uppercase tracking-wider f-mono ${
                      kind === k ? "bg-black text-white" : "bg-white hover:bg-black/5"
                    }`}
                  >
                    {k === "WEBHOOK" ? "Webhook" : "SMTP 邮件"}
                  </button>
                ))}
              </div>
              <input type="hidden" name="kind" value={kind} />
            </div>
          </div>

          {kind === "WEBHOOK" ? (
            <div className="space-y-4">
              <div className="grid grid-cols-4 gap-4">
                <div>
                  <label className={labelCls}>方法</label>
                  <select name="method" defaultValue="POST" className={`${inputCls} f-mono`}>
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
                  placeholder={"Authorization: Bearer xxx\nContent-Type: application/json"}
                  className={`${inputCls} f-mono`}
                />
              </div>
              <div>
                <label className={labelCls}>Body 模板（可选，留空发默认 JSON）</label>
                <textarea
                  name="bodyTemplate"
                  rows={3}
                  placeholder={'{"title": "{{title}}", "body": "{{body}}", "url": "https://subtrace.example/subscriptions/{{meta.subscriptionId}}"}'}
                  className={`${inputCls} f-mono`}
                />
                <p className="mt-1 text-[9px] uppercase text-neutral-400 f-mono">
                  占位：{"{{title}} {{body}} {{meta.subscriptionId}} {{meta.subscriptionName}} {{meta.dueDate}} {{meta.dayOffset}}"} ·
                  Bark / 企业微信 / ntfy / apprise-api 都能对接
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-2">
                  <label className={labelCls}>SMTP 主机</label>
                  <input name="host" required placeholder="smtp.qq.com" className={`${inputCls} f-mono`} />
                </div>
                <div>
                  <label className={labelCls}>端口</label>
                  <input name="port" required type="number" defaultValue={465} className={`${inputCls} f-mono`} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>账号（可选）</label>
                  <input name="user" autoComplete="off" className={`${inputCls} f-mono`} />
                </div>
                <div>
                  <label className={labelCls}>密码 / 授权码</label>
                  <input name="pass" type="password" autoComplete="new-password" className={`${inputCls} f-mono`} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>发件人</label>
                  <input name="from" required placeholder="subtrace@example.com" className={`${inputCls} f-mono`} />
                </div>
                <div>
                  <label className={labelCls}>收件人</label>
                  <input name="to" required placeholder="me@example.com" className={`${inputCls} f-mono`} />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="secure" defaultChecked className="h-4 w-4 accent-black" />
                SSL/TLS（465 端口勾选；587 STARTTLS 不勾）
              </label>
            </div>
          )}

          <button
            disabled={pending}
            className="border border-black bg-black px-4 py-2 text-[10px] uppercase tracking-wider text-white f-mono hover:bg-[#FF6B00] hover:border-[#FF6B00] disabled:opacity-40"
          >
            添加渠道
          </button>
        </form>
      </Panel>
    </div>
  );
}
