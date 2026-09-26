import { D, percentOf, roundMoney, subMoney } from "./money";

/**
 * Drawdown on an equity/balance path. Drawdown is measured from the running peak,
 * which starts at the initial level (so a first losing trade is a drawdown from the
 * starting balance). Amounts are positive numbers; percentages are relative to the peak.
 */

export interface DrawdownPoint {
  level: number;
  peak: number;
  drawdown: number;
  drawdownPct: number | null;
}

export function calculateDrawdown(current: number, peak: number): { amount: number; pct: number | null } {
  const amount = Math.max(0, subMoney(peak, current));
  return { amount, pct: peak > 0 ? percentOf(amount, peak) : null };
}

/** Running levels from an initial value plus successive changes (exact decimal accumulation). */
export function cumulativeLevels(initial: number, changes: number[]): number[] {
  const out: number[] = [];
  let acc = D(initial);
  for (const c of changes) {
    acc = acc.plus(D(c));
    out.push(roundMoney(acc));
  }
  return out;
}

export function drawdownSeries(initial: number, levels: number[]): DrawdownPoint[] {
  let peak = initial;
  return levels.map((level) => {
    if (level > peak) peak = level;
    const { amount, pct } = calculateDrawdown(level, peak);
    return { level, peak, drawdown: amount, drawdownPct: pct };
  });
}

export interface MaxDrawdown {
  /** Largest peak-to-trough decline in money. */
  amount: number;
  /** Largest peak-to-trough decline in % of the peak (may come from a different episode than `amount`). */
  pct: number | null;
  peak: number;
  trough: number;
  /** Index into `levels` of the trough of the largest money drawdown (−1 when none). */
  troughIndex: number;
  /** Index of the peak preceding that trough (−1 = the initial level). */
  peakIndex: number;
  /** Current drawdown from the latest running peak. */
  current: number;
  currentPct: number | null;
}

export function calculateMaxDrawdown(initial: number, levels: number[]): MaxDrawdown {
  let peak = initial;
  let peakIdx = -1;
  let best: MaxDrawdown = {
    amount: 0,
    pct: null,
    peak: initial,
    trough: initial,
    troughIndex: -1,
    peakIndex: -1,
    current: 0,
    currentPct: initial > 0 ? 0 : null,
  };
  let maxPct: number | null = initial > 0 ? 0 : null;
  levels.forEach((level, i) => {
    if (level > peak) {
      peak = level;
      peakIdx = i;
    }
    const { amount, pct } = calculateDrawdown(level, peak);
    if (amount > best.amount) {
      best = { ...best, amount, peak, trough: level, troughIndex: i, peakIndex: peakIdx };
    }
    if (pct !== null && (maxPct === null || pct > maxPct)) maxPct = pct;
  });
  const last = levels.length ? levels[levels.length - 1] : initial;
  const cur = calculateDrawdown(last, peak);
  return { ...best, pct: maxPct, current: cur.amount, currentPct: cur.pct };
}
