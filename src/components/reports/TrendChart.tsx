// 报表趋势图（reports-redo ticket 02）：零依赖手绘 SVG 双口径——摊销（ink 实线）vs 实付（橙色实线）。
// SSR 首帧直出、无客户端注水；悬浮读数走 <title>（每桶一条透明热区，含两口径金额）。
// 粒度由装配层定（≤62 天逐日，≤210 天逐周，否则逐月）；桶 label：逐日/逐周 = 桶起日 YYYY-MM-DD，逐月 = YYYY-MM。

import { ORANGE } from "@/components/te";
import { fmtMoney } from "@/lib/format";
import type { ReportTrendBucket } from "@/lib/reports";

const W = 640;
const H = 220;
const PAD = { l: 46, r: 10, t: 12, b: 22 };


export function TrendChart({
  buckets,
  currency,
}: {
  buckets: ReportTrendBucket[];
  currency: string;
}) {
  if (buckets.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-[11px] uppercase text-faint f-mono">
        区间内无成本
      </div>
    );
  }

  const plotW = W - PAD.l - PAD.r;
  const plotH = H - PAD.t - PAD.b;
  const maxV = Math.max(...buckets.map((b) => Math.max(b.amortized, b.paid)), 1);
  const n = buckets.length;
  const x = (i: number) => PAD.l + ((i + 0.5) / n) * plotW;
  // 负值桶（退款>金额）钳到 0 轴，防止静默跌出绘图区
  const y = (v: number) => PAD.t + (1 - Math.max(v, 0) / maxV) * plotH;
  const line = (key: "amortized" | "paid") =>
    buckets.map((b, i) => `${x(i).toFixed(1)},${y(b[key]).toFixed(1)}`).join(" ");

  // 格栅线：0 / 1/3 / 2/3 / 满值 四档
  const gridFracs = [0, 1 / 3, 2 / 3, 1];
  // X 轴疏标：首 / 中 / 尾（去重：单桶只标一次）
  const mid = Math.floor((n - 1) / 2);
  const xTicks = mid === 0 ? (n === 1 ? [0] : [0, n - 1]) : [0, mid, n - 1];

  return (
    <div className="px-4 py-4">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="摊销与实付趋势">
        {gridFracs.map((f) => (
          <g key={f}>
            <line
              x1={PAD.l}
              x2={W - PAD.r}
              y1={y(maxV * f)}
              y2={y(maxV * f)}
              stroke={f === 0 ? "var(--line-strong)" : "var(--line)"}
              strokeWidth={1}
            />
            <text
              x={PAD.l - 5}
              y={y(maxV * f) + 3}
              textAnchor="end"
              fontSize={9}
              fill="var(--faint)"
              className="f-mono"
            >
              {fmtMoney(Math.round(maxV * f), currency)}
            </text>
          </g>
        ))}

        <polyline points={line("amortized")} fill="none" stroke="var(--ink)" strokeWidth={1.5} />
        <polyline points={line("paid")} fill="none" stroke={ORANGE} strokeWidth={1.5} />

        {buckets.map((b, i) => (
          <g key={b.label}>
            <circle cx={x(i)} cy={y(b.amortized)} r={2} fill="var(--ink)" />
            <circle cx={x(i)} cy={y(b.paid)} r={2} fill={ORANGE} />
            {/* 悬浮热区：整桶竖条，title 出双口径读数 */}
            <rect x={(PAD.l + (i / n) * plotW).toFixed(1)} y={PAD.t} width={(plotW / n).toFixed(1)} height={plotH} fill="transparent">
              <title>{`${b.label} · 摊销 ${fmtMoney(b.amortized, currency)} · 实付 ${fmtMoney(b.paid, currency)}`}</title>
            </rect>
          </g>
        ))}

        {xTicks.map((i) => (
          <text
            key={i}
            x={x(i)}
            y={H - 6}
            textAnchor="middle"
            fontSize={9}
            fill="var(--faint)"
            className="f-mono"
          >
            {/* 逐日/逐周桶只显 MM-DD，逐月桶保留 YYYY-MM */}
            {buckets[i].label.length === 10 ? buckets[i].label.slice(5) : buckets[i].label}
          </text>
        ))}
      </svg>

      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[9px] uppercase text-muted f-mono">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4 bg-ink" />
          摊销 · 按服务天数逐日分摊
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4" style={{ background: ORANGE }} />
          实付 · 区间内实际流出
        </span>
        <span className="ml-auto text-faint">峰值 {fmtMoney(maxV, currency)}</span>
      </div>
    </div>
  );
}
