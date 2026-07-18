import { logoutAction } from "@/lib/auth/actions";
import { getCurrentUser } from "@/lib/auth/session";
import { InvitePanel } from "./InvitePanel";

// 占位 dashboard：ticket 03 将替换为完整 TE 风控制台
export default async function DashboardPage() {
  const user = (await getCurrentUser())!;
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#E4E3E0]">
      <div className="w-96 border border-black bg-white p-6 f-grotesk">
        <div className="mb-1 text-[9px] uppercase tracking-[0.25em] text-neutral-500 f-mono">
          01 / overview
        </div>
        <h1 className="mb-5 text-xl font-bold uppercase tracking-tight">控制台</h1>
        <div className="mb-4 text-sm">
          已登录：<span className="font-semibold">{user.username}</span>
          <span className="ml-2 border border-black px-1.5 py-0.5 text-[9px] uppercase f-mono">
            {user.role}
          </span>
        </div>
        {user.role === "ADMIN" && <InvitePanel />}
        <form action={logoutAction} className="mt-4">
          <button className="w-full border border-black bg-white py-2 text-[11px] font-semibold uppercase tracking-wider hover:bg-black hover:text-white">
            登出
          </button>
        </form>
      </div>
    </div>
  );
}
