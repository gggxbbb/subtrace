import { loginAction } from "@/lib/auth/actions";
import { versionLine } from "@/lib/version";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <div className="flex min-h-screen items-center justify-center bg-base">
      <form
        action={loginAction}
        className="w-80 border border-ink bg-surface p-6 f-grotesk"
      >
        <div className="mb-1 text-[9px] uppercase tracking-[0.25em] text-muted f-mono">
          subtrace / sign in
        </div>
        <h1 className="mb-5 text-xl font-bold uppercase tracking-tight">登录</h1>
        {error && (
          <div className="mb-4 border border-ink bg-accent px-2 py-1 text-[11px] uppercase text-white f-mono">
            用户名或密码错误
          </div>
        )}
        <label className="mb-1 block text-[10px] uppercase tracking-[0.15em] text-muted f-mono">
          用户名
        </label>
        <input
          name="username"
          required
          autoComplete="username"
          className="mb-4 min-h-[44px] w-full border border-ink bg-base px-2 py-1.5 text-sm outline-none focus:bg-surface md:min-h-0"
        />
        <label className="mb-1 block text-[10px] uppercase tracking-[0.15em] text-muted f-mono">
          密码
        </label>
        <input
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="mb-5 min-h-[44px] w-full border border-ink bg-base px-2 py-1.5 text-sm outline-none focus:bg-surface md:min-h-0"
        />
        <button className="min-h-[44px] w-full bg-ink py-2 text-[11px] font-semibold uppercase tracking-wider text-surface hover:bg-ink-hover md:min-h-0">
          登录 →
        </button>
        <div className="mt-4 text-center text-[10px] uppercase text-muted f-mono">
          没有账号？凭邀请链接注册
        </div>
      </form>
      <div className="fixed bottom-3 right-4 text-[9px] text-faint f-mono">{versionLine}</div>
    </div>
  );
}
