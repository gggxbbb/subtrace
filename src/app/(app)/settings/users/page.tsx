import { redirect } from "next/navigation";
import { isoDay } from "@/lib/dates";
import { PageHeader } from "@/components/PageHeader";
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
      <PageHeader
        crumb={<>settings / users</>}
        title={<>用户管理</>}
      />
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
