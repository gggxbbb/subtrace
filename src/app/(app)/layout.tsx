import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { Sidebar } from "@/components/Sidebar";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return (
    <div className="flex min-h-screen bg-[#E4E3E0] text-[#111] f-grotesk">
      <Sidebar username={user.username} role={user.role} />
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
