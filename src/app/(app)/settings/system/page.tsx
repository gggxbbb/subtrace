import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { ThemePanel } from "./ThemePanel";

export const dynamic = "force-dynamic";

export default async function SystemSettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <>
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-ink bg-base px-4 md:px-6">
        <div>
          <div className="text-[9px] uppercase tracking-[0.25em] text-muted f-mono">
            settings / system
          </div>
          <h1 className="text-xl font-bold uppercase tracking-tight">系统</h1>
        </div>
      </header>
      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-3xl">
          <ThemePanel />
        </div>
      </div>
    </>
  );
}
