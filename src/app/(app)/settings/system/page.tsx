import { redirect } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { getCurrentUser } from "@/lib/auth/session";
import { ThemePanel } from "./ThemePanel";

export const dynamic = "force-dynamic";

export default async function SystemSettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <>
      <PageHeader
        crumb={<>settings / system</>}
        title={<>系统</>}
      />
      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-3xl">
          <ThemePanel />
        </div>
      </div>
    </>
  );
}
