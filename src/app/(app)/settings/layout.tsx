import { SettingsTabs } from "./SettingsTabs";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-black bg-[#E4E3E0] px-6">
        <div>
          <div className="text-[9px] uppercase tracking-[0.25em] text-neutral-500 f-mono">
            06 / settings
          </div>
          <h1 className="text-xl font-bold uppercase tracking-tight">设置</h1>
        </div>
        <SettingsTabs />
      </header>
      {children}
    </>
  );
}
