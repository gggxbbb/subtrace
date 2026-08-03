// 额度包 FEFO 推演引擎（纯函数模块，无 DB/框架依赖）。
// 语义见 CONTEXT.md「额度包 / 发放形态」与 docs/adr/0012：
// 产品只暴露剩余总张数，本模块以剩余快照校准 + FEFO 推演重建包级账本。
//
// 推演规则（ADR-0012）：
// - 包有效到期日 = min(包到期日, 订阅到期日)，排他（当天起不可用）；
// - 两次快照间总消耗 D = 期初剩余 + 期间发放 − 期末剩余，先按窗口内到期包的
//   FEFO 模拟余额计浪费，其余计消费（消费先于到期的宽厚假设 → 浪费下限）；
// - 消费按先到期先扣（FEFO）从包中划扣，因此先到期的包余额最小、浪费最低；
// - 订阅终止日全部余额确认为浪费（由有效到期日截断自然推出）；
// - 快照之后的消费不可知：确认口径的推演边界 = 最新快照日，其后最早到期的
//   存活包以 nextExpiry 预警（projectedBalance = 当前 FEFO 模拟余额）。
// - 误差由快照吸收：剩余无发放回升时反向校准包余额，不冲减累计推算消费。

export type PackSource = "AUTO" | "MANUAL";

export interface PackInput {
  grantedAt: Date;
  quantity: number;
  /** 存「下发 + 有效期」原始值，停订截断在推演时现场计算 */
  expiresAt: Date;
  source: PackSource;
}

export interface RemainingSnapshot {
  date: Date;
  /** 产品界面可见的剩余总张数（TOTAL 快照，STACKED 语义 = 剩余） */
  remaining: number;
}

export interface PackLedgerInput {
  /** 顺序无关，引擎内部按到期日/下发日排序 */
  packs: PackInput[];
  /** 顺序无关，引擎内部按日期排序 */
  snapshots: RemainingSnapshot[];
  /** 停订即焚截断；null = 无已知到期日 */
  subscriptionExpiry: Date | null;
  /** AUTO = 发放段净额 ÷ 该段应发量；MANUAL（赠送包）= 0 */
  unitCostOf: (pack: PackInput) => number;
}

export interface PackWaste {
  /** 浪费确认日 = 包有效到期日 */
  date: Date;
  quantity: number;
  amount: number;
}

export interface PackLedger {
  /** 最新快照日期（余额时效）；无快照时为 null */
  balanceAt: Date | null;
  /** 最新快照校准余额 */
  balance: number;
  /** 下一到期包预警：projectedBalance = 最新校准后的 FEFO 模拟余额 */
  nextExpiry: { date: Date; quantity: number; projectedBalance: number } | null;
  /** 累计推算消费 */
  consumptionInferred: number;
  /** 已确认浪费，按到期日归集、升序 */
  waste: PackWaste[];
}

interface PackState {
  pack: PackInput;
  /** min(expiresAt, subscriptionExpiry)，排他 */
  effectiveExpiry: Date;
  balance: number;
}

const EMPTY_LEDGER: PackLedger = {
  balanceAt: null,
  balance: 0,
  nextExpiry: null,
  consumptionInferred: 0,
  waste: [],
};

export function projectPackLedger(input: PackLedgerInput): PackLedger {
  const snapshots = [...input.snapshots].sort(
    (a, b) => a.date.getTime() - b.date.getTime(),
  );
  if (snapshots.length === 0) return { ...EMPTY_LEDGER };

  const sub = input.subscriptionExpiry?.getTime() ?? null;
  const states: PackState[] = input.packs.map((pack) => ({
    pack,
    effectiveExpiry:
      sub !== null && sub < pack.expiresAt.getTime()
        ? (input.subscriptionExpiry as Date)
        : pack.expiresAt,
    balance: 0,
  }));
  // FEFO 扣减顺序：先到期先扣；同到期日先下发先扣
  const fefoOrder = (a: PackState, b: PackState) =>
    a.effectiveExpiry.getTime() - b.effectiveExpiry.getTime() ||
    a.pack.grantedAt.getTime() - b.pack.grantedAt.getTime();

  const live: PackState[] = [];
  const wasteByDate = new Map<number, PackWaste>();
  let consumptionInferred = 0;

  const burn = (s: PackState) => {
    if (s.balance <= 0) return;
    const key = s.effectiveExpiry.getTime();
    const entry = wasteByDate.get(key) ?? {
      date: s.effectiveExpiry,
      quantity: 0,
      amount: 0,
    };
    entry.quantity += s.balance;
    entry.amount += s.balance * input.unitCostOf(s.pack);
    wasteByDate.set(key, entry);
    s.balance = 0;
  };

  /** 快照校准：漂移（模拟余额 − 实测剩余）计消费并按 FEFO 划扣；负漂移反向校准 */
  const calibrate = (remaining: number) => {
    let drift = live.reduce((sum, s) => sum + s.balance, 0) - remaining;
    if (drift > 0) {
      consumptionInferred += drift;
      for (const s of [...live].sort(fefoOrder)) {
        if (drift <= 0) break;
        const take = Math.min(s.balance, drift);
        s.balance -= take;
        drift -= take;
      }
    } else if (drift < 0) {
      // 剩余无发放回升（未建模赠送/录入误差）：反向 FEFO 回补，先保晚到期的包，
      // 让临近到期的包余额保持最小（宽厚口径）；超出原始数量的尾差压到最晚包上，
      // 保证校准后 Σ余额 = 实测剩余，下一窗口从校准值起算。
      let surplus = -drift;
      const desc = [...live].sort(fefoOrder).reverse();
      for (const s of desc) {
        if (surplus <= 0) break;
        const room = Math.max(0, s.pack.quantity - s.balance);
        const add = Math.min(room, surplus);
        s.balance += add;
        surplus -= add;
      }
      if (surplus > 0 && desc.length > 0) desc[0].balance += surplus;
    }
  };

  let prev = snapshots[0].date.getTime();
  for (const s of states) {
    if (s.pack.grantedAt.getTime() <= prev && s.effectiveExpiry.getTime() > prev) {
      s.balance = s.pack.quantity;
      live.push(s);
    }
    // 首快照前已到期的包：无观测窗口，命运不可知，由首快照校准吸收（宽厚：不计浪费）
  }
  calibrate(snapshots[0].remaining);

  for (let i = 1; i < snapshots.length; i++) {
    const t = snapshots[i].date.getTime();
    // 窗口 (prev, t]：期间发放入池（满额），窗口内到期包按 FEFO 模拟余额焚毁
    for (const s of states) {
      const g = s.pack.grantedAt.getTime();
      if (g > prev && g <= t) {
        s.balance = s.pack.quantity;
        live.push(s);
      }
    }
    for (let j = live.length - 1; j >= 0; j--) {
      if (live[j].effectiveExpiry.getTime() <= t) {
        burn(live[j]);
        live.splice(j, 1);
      }
    }
    calibrate(snapshots[i].remaining);
    prev = t;
  }

  const last = snapshots[snapshots.length - 1];
  const next = live.length > 0 ? [...live].sort(fefoOrder)[0] : null;
  return {
    balanceAt: last.date,
    balance: last.remaining,
    nextExpiry: next
      ? {
          date: next.effectiveExpiry,
          quantity: next.pack.quantity,
          projectedBalance: next.balance,
        }
      : null,
    consumptionInferred,
    waste: [...wasteByDate.values()].sort(
      (a, b) => a.date.getTime() - b.date.getTime(),
    ),
  };
}
