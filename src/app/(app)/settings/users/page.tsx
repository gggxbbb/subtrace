import { redirect } from "next/navigation";
import { isoDay } from "@/lib/dates";
import { getCurrentUser } from "@/lib/auth/session";
import { listInvites, listUsers } from "@/lib/auth/service";
import { InviteManager } from "./InviteManager";
import { UsersTable } from "./UsersTable";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/dashboard");

  const [users, invites] = await Promise.all([listUsers(), listInvites()]);
  const iso = (d: Date) => isoDay(d);

  return (
    <>
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-ink bg-base px-4 md:px-6">
        <div>
          <div className="text-[9px] uppercase tracking-[0.25em] text-neutral-500 f-mono">
            settings / users
          </div>
          <h1 className="text-xl font-bold uppercase tracking-tight">用户管理</h1>
        </div>
      </header>
      <div className="flex-1 space-y-4 overflow-y-auto p-6">
        <UsersTable
          users={users.map((u) => ({
            ...u,
            createdAt: iso(u.createdAt),
            isMe: u.id === user.id,
          }))}
        />

        <InviteManager
          invites={invites.map((inv) => ({
            ...inv,
            expiresAt: iso(inv.expiresAt),
            createdAt: iso(inv.createdAt),
          }))}
        />
      </div>
    </>
  );
}
