import { Panel } from "@/components/te";

export default function ScriptsPage() {
  return (
    <>
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-black bg-[#E4E3E0] px-6">
        <div>
          <div className="text-[9px] uppercase tracking-[0.25em] text-neutral-500 f-mono">
            settings / scripts
          </div>
          <h1 className="text-xl font-bold uppercase tracking-tight">用量脚本</h1>
        </div>
      </header>
      <div className="flex-1 overflow-y-auto p-6">
      <div className="mx-auto max-w-3xl">
        <Panel index="01" title="用量脚本">
          <div className="px-4 py-8 text-center text-[11px] uppercase leading-relaxed text-neutral-400 f-mono">
            ticket 10 待实现
            <br />
            将支持用户自定义脚本自动同步额度型订阅的用量（机场流量等）
          </div>
        </Panel>
      </div>
    </div>
    </>
  );
}
