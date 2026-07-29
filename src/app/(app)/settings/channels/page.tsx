import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { listChannels } from "@/lib/notifications/service";
import { ChannelsPanel } from "./ChannelsPanel";

export const dynamic = "force-dynamic";

export default async function ChannelsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const channels = await listChannels(user.id);

  return (
    <>
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-ink bg-base px-4 md:px-6">
        <div>
          <div className="text-[9px] uppercase tracking-[0.25em] text-neutral-500 f-mono">
            settings / channels
          </div>
          <h1 className="text-xl font-bold uppercase tracking-tight">通知渠道</h1>
        </div>
      </header>
      <div className="flex-1 overflow-y-auto p-6">
      <div className="mx-auto max-w-3xl">
        <p className="mb-4 text-[10px] uppercase leading-relaxed tracking-wider text-neutral-500 f-mono">
          系统每天定时检查「到期日 − 提醒天数 = 今天」的订阅，经这里已启用的渠道发送提醒；
          发送记录可在「定时任务」页查看。提醒天数在每个订阅的编辑页配置，默认 7,3,0。
        </p>
        <ChannelsPanel channels={channels} />
      </div>
    </div>
    </>
  );
}
