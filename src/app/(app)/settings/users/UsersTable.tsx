"use client";

// 用户列表（ADMIN）：角色切换 / 重置密码 / 删除。自己与最后一个 ADMIN 由服务端护栏拦截。

import { useState, useTransition } from "react";
import { deleteUserAction, resetUserPasswordAction, setCanUseScriptsAction, setUserRoleAction } from "@/lib/auth/actions";
import { Panel, fmtDate } from "@/components/te";

export interface UserRow {
  id: string;
  username: string;
  role: string;
  baseCurrency: string;
  canUseScripts: boolean;
  createdAt: string;
  subscriptionCount: number;
  isMe: boolean;
}

export function UsersTable({ users }: { users: UserRow[] }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = (fn: () => Promise<void>) =>
    start(async () => {
      setError(null);
      try {
        await fn();
      } catch (e) {
        setError(e instanceof Error ? e.message : "操作失败");
      }
    });

  return (
    <Panel index="01" title={`用户 / ${users.length}`}>
      {error && (
        <div className="border-b border-black bg-[#ef4444] px-4 py-1.5 text-[10px] uppercase text-white f-mono">
          {error}
        </div>
      )}
      <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] text-[13px]">
        <thead>
          <tr className="border-b border-black text-left text-[9px] uppercase tracking-[0.15em] text-neutral-500 f-mono">
            <th className="px-4 py-2 font-medium">用户名</th>
            <th className="px-4 py-2 font-medium">角色</th>
            <th className="px-4 py-2 font-medium">主币种</th>
            <th className="px-4 py-2 font-medium">脚本权限</th>
            <th className="px-4 py-2 text-right font-medium">订阅数</th>
            <th className="px-4 py-2 font-medium">注册时间</th>
            <th className="px-4 py-2 text-right font-medium">操作</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} className="group border-b border-neutral-200 last:border-0 hover:bg-black/[0.03]">
              <td className="px-4 py-2.5 font-medium">
                {u.username}
                {u.isMe && <span className="ml-2 text-[9px] uppercase text-neutral-400 f-mono">（我）</span>}
              </td>
              <td className="px-4 py-2.5">
                <span
                  className={`px-1.5 py-0.5 text-[9px] uppercase f-mono ${
                    u.role === "ADMIN" ? "bg-black text-white" : "text-neutral-500"
                  }`}
                >
                  {u.role}
                </span>
              </td>
              <td className="px-4 py-2.5 text-[11px] text-neutral-500 f-mono">{u.baseCurrency}</td>
              <td className="px-4 py-2.5">
                <button
                  disabled={pending}
                  onClick={() => run(() => setCanUseScriptsAction(u.id, !u.canUseScripts))}
                  className={`px-1.5 py-0.5 text-[9px] uppercase f-mono ${u.canUseScripts ? "bg-black text-white" : "border border-black bg-white text-neutral-400 hover:bg-black/5"} disabled:opacity-40`}
                >
                  {u.canUseScripts ? "信任" : "关闭"}
                </button>
              </td>
              <td className="px-4 py-2.5 text-right text-[11px] tabular-nums f-mono">{u.subscriptionCount}</td>
              <td className="px-4 py-2.5 text-[11px] text-neutral-500 f-mono">{fmtDate(new Date(`${u.createdAt}T00:00:00+08:00`))}</td>
              <td className="px-4 py-2.5 text-right">
                {!u.isMe && (
                  <span className="invisible flex justify-end gap-1.5 group-hover:visible">
                    <button
                      disabled={pending}
                      onClick={() => run(() => setUserRoleAction(u.id, u.role === "ADMIN" ? "USER" : "ADMIN"))}
                      className="border border-black bg-white px-2 py-0.5 text-[9px] uppercase f-mono hover:bg-black hover:text-white disabled:opacity-40"
                    >
                      {u.role === "ADMIN" ? "降为 USER" : "升为 ADMIN"}
                    </button>
                    <button
                      disabled={pending}
                      onClick={() => {
                        const pwd = prompt(`为 ${u.username} 设置新密码（至少 8 位）：`);
                        if (pwd) run(() => resetUserPasswordAction(u.id, pwd));
                      }}
                      className="border border-black bg-white px-2 py-0.5 text-[9px] uppercase f-mono hover:bg-black hover:text-white disabled:opacity-40"
                    >
                      重置密码
                    </button>
                    <button
                      disabled={pending}
                      onClick={() => {
                        if (confirm(`删除用户 ${u.username}？其订阅/物品/渠道等全部数据将一并删除，不可恢复。`)) {
                          run(() => deleteUserAction(u.id));
                        }
                      }}
                      className="border border-black bg-white px-2 py-0.5 text-[9px] uppercase f-mono text-[#ef4444] hover:bg-[#ef4444] hover:text-white disabled:opacity-40"
                    >
                      删除
                    </button>
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </Panel>
  );
}
