import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { MobileNav, Sidebar } from "@/components/Sidebar";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return (
    <div className="flex min-h-screen flex-col bg-base text-ink f-grotesk md:flex-row">
      <Sidebar username={user.username} role={user.role} canUseScripts={user.canUseScripts} />
      <MobileNav username={user.username} role={user.role} canUseScripts={user.canUseScripts} />
      <main className="min-w-0 flex-1 pb-20 md:pb-0">{children}</main>
    </div>
  );
}
