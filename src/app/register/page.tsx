import { registerAction } from "@/lib/auth/actions";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; invite?: string }>;
}) {
  const { error, invite } = await searchParams;
  return (
    <div className="flex min-h-screen items-center justify-center bg-base">
      <form
        action={registerAction}
        className="w-80 border border-ink bg-surface p-6 f-grotesk"
      >
        <div className="mb-1 text-[9px] uppercase tracking-[0.25em] text-neutral-500 f-mono">
          subtrace / register
        </div>
        <h1 className="mb-5 text-xl font-bold uppercase tracking-tight">注册</h1>
        {error && (
          <div className="mb-4 border border-ink bg-accent px-2 py-1 text-[11px] uppercase text-white f-mono">
            注册失败：用户名被占用或邀请无效
          </div>
        )}
        <label className="mb-1 block text-[10px] uppercase tracking-[0.15em] text-neutral-500 f-mono">
          用户名
        </label>
        <input
          name="username"
          required
          autoComplete="username"
          className="mb-4 min-h-[44px] w-full border border-ink bg-base px-2 py-1.5 text-sm outline-none focus:bg-surface md:min-h-0"
        />
        <label className="mb-1 block text-[10px] uppercase tracking-[0.15em] text-neutral-500 f-mono">
          密码
        </label>
        <input
          name="password"
          type="password"
          required
          autoComplete="new-password"
          className="mb-4 min-h-[44px] w-full border border-ink bg-base px-2 py-1.5 text-sm outline-none focus:bg-surface md:min-h-0"
        />
        <label className="mb-1 block text-[10px] uppercase tracking-[0.15em] text-neutral-500 f-mono">
          邀请 token（首个用户留空）
        </label>
        <input
          name="invite"
          defaultValue={invite ?? ""}
          className="mb-5 min-h-[44px] w-full border border-ink bg-base px-2 py-1.5 text-sm outline-none focus:bg-surface f-mono md:min-h-0"
        />
        <button className="min-h-[44px] w-full bg-ink py-2 text-[11px] font-semibold uppercase tracking-wider text-surface hover:bg-ink-hover md:min-h-0">
          注册 →
        </button>
      </form>
    </div>
  );
}
