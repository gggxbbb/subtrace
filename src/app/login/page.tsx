import { loginAction } from "@/lib/auth/actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#E4E3E0]">
      <form
        action={loginAction}
        className="w-80 border border-black bg-white p-6 f-grotesk"
      >
        <div className="mb-1 text-[9px] uppercase tracking-[0.25em] text-neutral-500 f-mono">
          subtrace / sign in
        </div>
        <h1 className="mb-5 text-xl font-bold uppercase tracking-tight">登录</h1>
        {error && (
          <div className="mb-4 border border-black bg-[#FF5A00] px-2 py-1 text-[11px] uppercase text-white f-mono">
            用户名或密码错误
          </div>
        )}
        <label className="mb-1 block text-[10px] uppercase tracking-[0.15em] text-neutral-500 f-mono">
          用户名
        </label>
        <input
          name="username"
          required
          autoComplete="username"
          className="mb-4 w-full border border-black bg-[#E4E3E0] px-2 py-1.5 text-sm outline-none focus:bg-white"
        />
        <label className="mb-1 block text-[10px] uppercase tracking-[0.15em] text-neutral-500 f-mono">
          密码
        </label>
        <input
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="mb-5 w-full border border-black bg-[#E4E3E0] px-2 py-1.5 text-sm outline-none focus:bg-white"
        />
        <button className="w-full bg-black py-2 text-[11px] font-semibold uppercase tracking-wider text-white hover:bg-neutral-800">
          登录 →
        </button>
        <div className="mt-4 text-center text-[10px] uppercase text-neutral-500 f-mono">
          没有账号？凭邀请链接注册
        </div>
      </form>
    </div>
  );
}
