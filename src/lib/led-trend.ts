/**
 * 点阵趋势屏纯函数（.scratch/led-matrix-responsive）。
 * 重采样核：把 values 视为 bin 中心在 i+0.5 的分段线性曲线（两端常数外延），
 * 定义域 [0, m]；输出第 k 列 = 曲线在 [k·m/n, (k+1)·m/n] 的积分均值。
 * 性质：面积守恒 Σout·(m/n)=Σin；收缩摊薄尖峰不消失；
 * n=m 时偏差有界（≤相邻步进/4，精确恒等与守恒互斥，取守恒）。
 */

export function resampleArea(values: number[], n: number): number[] {
  const m = values.length;
  if (m === 0 || n <= 0) return [];
  const cols = Math.floor(n);
  if (m === 1) return Array.from({ length: cols }, () => values[0]);

  // 节点：x = 0, 0.5, 1.5, …, m-0.5, m；f 值：v0, v0, v1, …, v(m-1), v(m-1)
  const knotX: number[] = [0];
  const knotF: number[] = [values[0]];
  for (let i = 0; i < m; i++) {
    knotX.push(i + 0.5);
    knotF.push(values[i]);
  }
  knotX.push(m);
  knotF.push(values[m - 1]);

  // 节点前缀积分（梯形）
  const prefix: number[] = [0];
  for (let j = 0; j + 1 < knotX.length; j++) {
    const w = knotX[j + 1] - knotX[j];
    prefix.push(prefix[j] + ((knotF[j] + knotF[j + 1]) / 2) * w);
  }

  // F(x)：曲线在 [0, x] 的积分。查询点单调递增，线性扫描摊还 O(1)
  let seg = 0;
  const integralTo = (x: number): number => {
    while (seg + 1 < knotX.length && knotX[seg + 1] < x) seg++;
    const x0 = knotX[seg];
    const x1 = knotX[seg + 1];
    const t = (x - x0) / (x1 - x0);
    const fx = knotF[seg] + t * (knotF[seg + 1] - knotF[seg]);
    return prefix[seg] + ((knotF[seg] + fx) / 2) * (x - x0);
  };

  const out: number[] = [];
  let prev = 0;
  for (let k = 0; k < cols; k++) {
    const b = ((k + 1) * m) / cols;
    const fb = integralTo(b);
    out.push((fb - prev) / (b - (k * m) / cols));
    prev = fb;
  }
  return out;
}

/** 行列推导：N=clamp(⌊(w+4)/7⌋, 8, 88)，点径=min(列宽, 9)，rows=⌊104/(d+4)⌋ */
export function gridLayout(w: number): { cols: number; dot: number; rows: number } {
  const GAP = 4;
  const width = Math.max(0, w);
  const cols = Math.min(88, Math.max(8, Math.floor((width + GAP) / 7)));
  const colWidth = (width - (cols - 1) * GAP) / cols;
  const dot = Math.min(Math.max(colWidth, 1), 9);
  const rows = Math.max(1, Math.floor(104 / (dot + GAP)));
  return { cols, dot, rows };
}
