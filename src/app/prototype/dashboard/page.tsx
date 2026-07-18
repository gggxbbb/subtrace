// PROTOTYPE ONLY — Teenage Engineering 风格控制台，mock 数据。
// 设计语言：浅灰工业底色 + 黑色描边面板 + 单一橙 (#FF5A00) 强调，
// Space Grotesk 大数字 + IBM Plex Mono 标签，LED 状态点，无圆角或微圆角。

import {
  AlertTriangle,
  Armchair,
  ArrowRight,
  BarChart3,
  Bell,
  Bot,
  Boxes,
  ChevronDown,
  Clapperboard,
  Cloud,
  Dumbbell,
  Headphones,
  Laptop,
  LayoutDashboard,
  Package,
  Plus,
  RefreshCcw,
  Settings,
  SquareTerminal,
} from "lucide-react";
import {
  siBaidu,
  siBilibili,
  siIcloud,
  type SimpleIcon,
} from "simple-icons";

import { dashboardData as d, fmt } from "@/lib/prototype/mock-data";
import type { ComponentType } from "react";




const ORANGE = "#FF5A00";

// 品牌 logo（Simple Icons 单色 SVG path）；无 logo 的用 lucide 通用图标兜底
function brandIcon(icon: SimpleIcon) {
  return function BrandSvg({ className }: { className?: string }) {
    return (
      <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
        <path d={icon.path} />
      </svg>
    );
  };
}

const BRAND: Record<string, ComponentType<{ className?: string }>> = {
  s1: brandIcon(siBilibili),
  s2: Bot,
  s3: brandIcon(siBaidu),
  s4: Dumbbell,
  s5: Clapperboard,
  s6: brandIcon(siIcloud),
  p1: Laptop,
  p2: Headphones,
  p3: Armchair,
  u1: brandIcon(siIcloud),
  u2: Bot,
  u3: Clapperboard,
};

function Brand({ id, className }: { id: string; className?: string }) {
  const Icon = BRAND[id] ?? Package;
  return <Icon className={className} />;
}

function Led({ color = ORANGE }: { color?: string }) {
  return (
    <span
      className="inline-block h-1.5 w-1.5 rounded-full"
      style={{ background: color }}
    />
  );
}

// LED 点阵：rows×cols 的圆点阵列，未点亮点以低透明度呈现（像熄灭的灯珠）
function LedMatrix({
  rows,
  cols,
  lit,
  dark = false,
  size = 6,
  gap = 4,
  stretch = false,
}: {
  rows: number;
  cols: number;
  /** 返回 false=熄灭，true=默认橙，字符串=指定颜色 */
  lit: (r: number, c: number) => boolean | string;
  /** dark=true 用于深色屏（未亮点为白色低透明） */
  dark?: boolean;
  size?: number;
  gap?: number;
  /** stretch=true 时列均分容器宽度，点随列宽伸缩 */
  stretch?: boolean;
}) {
  return (
    <div
      role="img"
      style={{
        display: "grid",
        gridTemplateColumns: stretch
          ? `repeat(${cols}, 1fr)`
          : `repeat(${cols}, ${size}px)`,
        gap,
      }}
    >
      {Array.from({ length: rows * cols }).map((_, i) => {
        const r = Math.floor(i / cols);
        const c = i % cols;
        const v = lit(r, c);
        return (
          <span
            key={i}
            style={{
              width: stretch ? "100%" : size,
              ...(stretch ? { aspectRatio: "1", maxWidth: size, maxHeight: size } : { height: size }),
              borderRadius: "50%",
              background: v
                ? typeof v === "string"
                  ? v
                  : ORANGE
                : dark
                  ? "rgba(255,255,255,0.09)"
                  : "rgba(0,0,0,0.08)",
            }}
          />
        );
      })}
    </div>
  );
}

const NAV = [
  {
    group: "WORKBENCH / 工作台",
    items: [
      { icon: LayoutDashboard, label: "控制台", active: true },
      { icon: RefreshCcw, label: "订阅", active: false },
      { icon: Boxes, label: "联合会员", active: false },
      { icon: Package, label: "物品", active: false },
      { icon: BarChart3, label: "报表", active: false },
    ],
  },
  {
    group: "ACCOUNT / 账户",
    items: [
      { icon: Settings, label: "设置", active: false },
      { icon: Bell, label: "通知渠道", active: false },
      { icon: SquareTerminal, label: "用量脚本", active: false },
    ],
  },
];

function Kpi({
  index,
  label,
  value,
  sub,
  led,
}: {
  index: string;
  label: string;
  value: string;
  sub: string;
  led?: string;
}) {
  return (
    <div className="border border-black bg-white p-4">
      <div className={`flex items-center justify-between text-[10px] uppercase tracking-[0.15em] text-neutral-500 f-mono`}>
        <span>{label}</span>
        <span className="flex items-center gap-1.5 text-neutral-400">
          {index} {led && <Led color={led} />}
        </span>
      </div>
      <div className="mt-2 text-[28px] font-bold leading-none tracking-tight tabular-nums">
        {value}
      </div>
      <div className={`mt-2 text-[10px] text-neutral-500 f-mono`}>{sub}</div>
    </div>
  );
}

// 点阵趋势屏：每天插值为 3 列铺满屏宽，柱高=当日支出，柱顶白点、柱身橙点
function LedTrendChart({ data }: { data: number[] }) {
  const rows = 8;
  const max = Math.max(...data) * 1.1;
  const heights = data.map((v) => Math.max(1, Math.round((v / max) * rows)));
  // 线性插值 3×
  const cols: number[] = [];
  for (let i = 0; i < heights.length - 1; i++) {
    const a = heights[i];
    const b = heights[i + 1];
    cols.push(a, Math.round(a + (b - a) / 3), Math.round(a + ((b - a) * 2) / 3));
  }
  cols.push(heights[heights.length - 1]);
  return (
    <div className="bg-[#111] px-4 py-4">
      <LedMatrix
        rows={rows}
        cols={cols.length}
        size={9}
        gap={4}
        dark
        stretch
        lit={(r, c) => {
          const h = cols[c];
          const fromBottom = rows - 1 - r;
          if (fromBottom >= h) return false;
          return fromBottom === h - 1 ? "#F5F4F0" : true;
        }}
      />
    </div>
  );
}

function Panel({
  index,
  title,
  action,
  children,
}: {
  index: string;
  title: string;
  action?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border border-black bg-white">
      <header className="flex items-center justify-between border-b border-black px-4 py-2.5">
        <span className={`text-[10px] font-semibold uppercase tracking-[0.15em] f-mono`}>
          <span className="text-neutral-400">{index}</span> — {title}
        </span>
        {action && (
          <span className={`flex items-center gap-1 text-[10px] uppercase tracking-wider text-neutral-500 f-mono`}>
            {action} <ArrowRight className="h-3 w-3" />
          </span>
        )}
      </header>
      {children}
    </section>
  );
}

export default function PrototypeDashboard() {
  const usageTotal = d.usageBoard.reduce((s, u) => s + u.verdict, 0);
  const itemDaily = d.purchases.reduce((s, p) => s + p.dailyCost, 0);

  return (
    <div className={`flex min-h-screen bg-[#E4E3E0] text-[#111] f-grotesk`}>
      {/* ── 侧边栏 ── */}
      <aside className="flex w-56 shrink-0 flex-col border-r border-black bg-[#E4E3E0]">
        <div className="flex h-16 items-center gap-3 border-b border-black px-4">
          <div className="flex h-9 w-9 items-center justify-center bg-black text-base font-bold text-white">
            S.
          </div>
          <div>
            <div className="text-sm font-bold uppercase tracking-wider">Subtrace</div>
            <div className={`text-[9px] uppercase tracking-widest text-neutral-500 f-mono`}>
              subscription field kit
            </div>
          </div>
        </div>
        <nav className="flex-1 px-2 py-3">
          {NAV.map((g) => (
            <div key={g.group} className="mb-5">
              <div className={`flex items-center justify-between border-b border-dashed border-neutral-400 px-2 pb-1 text-[9px] uppercase tracking-[0.2em] text-neutral-500 f-mono`}>
                {g.group}
                <ChevronDown className="h-3 w-3" />
              </div>
              <div className="mt-1.5 space-y-0.5">
                {g.items.map((it) => (
                  <div
                    key={it.label}
                    className={`flex cursor-pointer items-center gap-2.5 px-2 py-1.5 text-[13px] font-medium ${
                      it.active
                        ? "bg-black text-white"
                        : "text-neutral-700 hover:bg-black/5"
                    }`}
                  >
                    <it.icon className="h-3.5 w-3.5" strokeWidth={2.2} />
                    {it.label}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </nav>
        <div className="border-t border-black px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center border border-black bg-white text-[10px] font-bold">
              G
            </div>
            <div className="f-mono">
              <div className="text-[11px] font-semibold">gggxbbb</div>
              <div className="flex items-center gap-1 text-[9px] uppercase text-neutral-500">
                <Led color="#22c55e" /> online
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* ── 主区域 ── */}
      <main className="min-w-0 flex-1">
        <header className="flex h-16 items-center justify-between border-b border-black bg-[#E4E3E0] px-6">
          <div>
            <div className={`text-[9px] uppercase tracking-[0.25em] text-neutral-500 f-mono`}>
              01 / overview
            </div>
            <h1 className="text-xl font-bold uppercase tracking-tight">控制台</h1>
          </div>
          <div className="flex items-center gap-2.5">
            <button className="flex items-center gap-1.5 bg-black px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-white hover:bg-neutral-800">
              <Plus className="h-3.5 w-3.5" strokeWidth={2.5} /> 记一笔
            </button>
            <span className={`flex items-center gap-1 border border-black bg-white px-2.5 py-2 text-[10px] uppercase f-mono`}>
              CN 中文 <ChevronDown className="h-3 w-3" />
            </span>
          </div>
        </header>

        <div className="space-y-4 px-6 py-5">
          {/* 告警条 */}
          <div className="flex items-center justify-between border border-black bg-white px-4 py-2.5">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-4 w-4" style={{ color: ORANGE }} />
              <span className="text-[13px]">
                <span className={`mr-2 border border-black bg-[#E4E3E0] px-1.5 py-0.5 text-[9px] uppercase tracking-wider f-mono`}>
                  待续费
                </span>
                3 个订阅将在 30 天内到期，iCloud+ 将于 7 天后自动扣费
              </span>
            </div>
            <span className={`flex items-center gap-1 text-[10px] uppercase tracking-wider underline underline-offset-2 f-mono`}>
              查看全部 <ArrowRight className="h-3 w-3" />
            </span>
          </div>

          {/* KPI */}
          <div className="grid grid-cols-4 gap-4">
            <Kpi index="A1" label="当日总日均" value={fmt(d.totalDailyCost)} sub={`≈ 每月 ${fmt(d.totalMonthlyCost)}`} led={ORANGE} />
            <Kpi index="A2" label="本月支出" value={fmt(d.monthSpent)} sub={`年度累计 ${fmt(d.yearSpent)}`} />
            <Kpi index="A3" label="活跃订阅" value={`${d.subscriptions.length}`} sub={`物品 ${d.purchases.length} 件 · 日均 ${fmt(itemDaily)}`} />
            <Kpi index="A4" label="本月用量盈亏" value={`+${fmt(usageTotal)}`} sub="3 个可量化订阅" led="#22c55e" />
          </div>

          {/* 趋势 */}
          <Panel index="02" title="每日支出 / 30D" action="报表">
            <div>
              <LedTrendChart data={d.spendingTrend} />
              <div className={`mx-4 flex justify-between border-t border-dashed border-neutral-300 mt-3 mb-3 py-1.5 text-[9px] uppercase text-neutral-400 f-mono`}>
                <span>30 days ago</span>
                <span style={{ color: ORANGE }}>avg {fmt(d.spendingTrend.reduce((s, v) => s + v, 0) / d.spendingTrend.length)}/day</span>
                <span>today</span>
              </div>
            </div>
          </Panel>

          {/* 双栏 */}
          <div className="grid grid-cols-2 gap-4">
            <Panel index="03" title="即将到期" action="全部">
              {d.upcoming.map((u) => (
                <div key={u.id} className="flex items-center justify-between border-b border-neutral-200 px-4 py-2.5 last:border-0">
                  <div className="flex items-center gap-3">
                    <Brand id={u.id} className="h-4 w-4" />
                    <div>
                      <div className="text-[13px] font-medium">{u.name}</div>
                      <div className={`text-[9px] uppercase tracking-wider text-neutral-400 f-mono`}>
                        {u.date} · {u.auto ? "auto" : "manual"}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <LedMatrix
                      rows={2}
                      cols={8}
                      size={4}
                      gap={2.5}
                      lit={(_, c) =>
                        c < Math.max(1, Math.min(8, 8 - Math.floor(u.daysLeft / 10)))
                          ? u.daysLeft <= 14
                            ? true
                            : "#111"
                          : false
                      }
                    />
                    <span className="text-sm font-bold tabular-nums">{fmt(u.amount)}</span>
                    <span
                      className={`flex w-16 items-center justify-center gap-1 border px-1.5 py-0.5 text-[9px] uppercase f-mono ${u.daysLeft <= 7 ? "text-white" : "border-black bg-white"}`}
                      style={u.daysLeft <= 7 ? { background: ORANGE, borderColor: ORANGE } : {}}
                    >
                      {u.daysLeft <= 7 && <Led color="#fff" />}
                      {u.daysLeft}d left
                    </span>
                  </div>
                </div>
              ))}
            </Panel>

            <Panel index="04" title="用量盈亏" action="本区间">
              {d.usageBoard.map((u) => (
                <div key={u.name} className="flex items-center justify-between border-b border-neutral-200 px-4 py-2.5 last:border-0">
                  <div className="flex items-center gap-3">
                    <Brand id={d.usageBoard.indexOf(u) === 0 ? "u2" : d.usageBoard.indexOf(u) === 1 ? "s4" : "u3"} className="h-4 w-4" />
                    <div>
                      <div className="text-[13px] font-medium">{u.name}</div>
                      <div className={`text-[9px] text-neutral-400 f-mono`}>{u.detail}</div>
                    </div>
                  </div>
                  <span className={`flex items-center gap-1.5 text-sm font-bold tabular-nums f-mono`}>
                    {u.verdict >= 0 ? "+" : "−"}{fmt(Math.abs(u.verdict))}
                    <Led color={u.verdict >= 0 ? "#22c55e" : "#ef4444"} />
                  </span>
                </div>
              ))}
            </Panel>
          </div>

          {/* 物品回本 */}
          <Panel index="05" title="物品回本进度" action="物品">
            <div className="grid grid-cols-3 gap-px bg-neutral-200">
              {d.purchases.map((p) => (
                <div key={p.id} className="bg-white px-4 py-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Brand id={p.id} className="h-4 w-4" />
                      <span className="text-[13px] font-medium">{p.name}</span>
                    </div>
                    <span className={`text-[9px] uppercase text-neutral-400 f-mono`}>
                      {p.daysHeld}d held
                    </span>
                  </div>
                  <div className="mt-2.5 h-1.5 w-full bg-[#E4E3E0]">
                    <div
                      className="h-full"
                      style={{
                        width: `${Math.round((p.breakevenProgress ?? Math.min(1, p.daysHeld / 1095)) * 100)}%`,
                        background: ORANGE,
                      }}
                    />
                  </div>
                  <div className={`mt-1.5 flex justify-between text-[9px] text-neutral-500 f-mono`}>
                    <span>{fmt(p.dailyCost)}/day</span>
                    <span>{fmt(p.amount)}</span>
                  </div>
                </div>
              ))}
            </div>
          </Panel>

          {/* 订阅明细表 */}
          <Panel index="06" title="订阅明细" action="管理">
            <table className="w-full text-[13px]">
              <thead>
                <tr className={`border-b border-black text-left text-[9px] uppercase tracking-[0.15em] text-neutral-500 f-mono`}>
                  <th className="px-4 py-2 font-medium">名称</th>
                  <th className="px-4 py-2 font-medium">分类</th>
                  <th className="px-4 py-2 font-medium">周期</th>
                  <th className="px-4 py-2 font-medium">到期日</th>
                  <th className="px-4 py-2 text-right font-medium">日均</th>
                  <th className="px-4 py-2 text-right font-medium">月均</th>
                  <th className="px-4 py-2 font-medium">状态</th>
                </tr>
              </thead>
              <tbody>
                {d.subscriptions.map((s) => (
                  <tr key={s.id} className="border-b border-neutral-200 last:border-0 hover:bg-black/[0.03]">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <Brand id={s.id} className="h-4 w-4" />
                        <span className="font-medium">{s.name}</span>
                        {s.sharedWith && (
                          <span className={`border border-neutral-300 px-1 py-0.5 text-[8px] uppercase text-neutral-500 f-mono`}>
                            共享 {s.sharedWith.length + 1}p
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-neutral-500">{s.category}</td>
                    <td className={`px-4 py-2.5 text-neutral-500 f-mono text-[11px]`}>{s.cycleLabel}</td>
                    <td className={`px-4 py-2.5 tabular-nums text-neutral-500 f-mono text-[11px]`}>{s.expiryDate}</td>
                    <td className={`px-4 py-2.5 text-right font-semibold tabular-nums f-mono text-[11px]`}>{fmt(s.dailyCost)}</td>
                    <td className={`px-4 py-2.5 text-right tabular-nums text-neutral-500 f-mono text-[11px]`}>{fmt(s.monthlyCost)}</td>
                    <td className="px-4 py-2.5">
                      {s.daysUntilExpiry <= 14 ? (
                        <span className={`flex w-fit items-center gap-1.5 px-1.5 py-0.5 text-[9px] uppercase text-white f-mono`} style={{ background: ORANGE }}>
                          <Led color="#fff" /> {s.daysUntilExpiry}d
                        </span>
                      ) : (
                        <span className={`flex w-fit items-center gap-1.5 px-1.5 py-0.5 text-[9px] uppercase f-mono`}>
                          <Led color="#22c55e" /> ok
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        </div>
      </main>
    </div>
  );
}
