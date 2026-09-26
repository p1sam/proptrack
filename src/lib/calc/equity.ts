import { drawdownSeries } from "./drawdown";
import { D, MoneyAccumulator, percentOf, roundMoney, sumMoney } from "./money";
import { classifyOutcome } from "./stats";
import { dayKey, monthKey } from "./time";

export interface SeriesTrade {
  id: string;
  closedAt: Date;
  netPnl: number;
  rMultiple?: number | null;
}

export interface EquityPoint {
  at: string;
  tradeId: string;
  pnl: number;
  cumPnl: number;
  balance: number;
  cumR: number;
  returnPct: number | null;
  drawdown: number;
  drawdownPct: number | null;
}

/** Per-trade equity path starting from `startingCapital` (0 = pure cumulative P&L). */
export function buildEquitySeries(trades: SeriesTrade[], startingCapital = 0): EquityPoint[] {
  const sorted = [...trades].sort((a, b) => a.closedAt.getTime() - b.closedAt.getTime() || a.id.localeCompare(b.id));
  const cum = new MoneyAccumulator();
  const cumR = new MoneyAccumulator();
  const raw = sorted.map((t) => {
    cum.add(t.netPnl);
    if (t.rMultiple != null) cumR.add(t.rMultiple);
    return { t, cumPnl: cum.value, cumR: cumR.value };
  });
  const dd = drawdownSeries(startingCapital, raw.map((r) => sumMoney([startingCapital, r.cumPnl])));
  return raw.map((r, i) => ({
    at: r.t.closedAt.toISOString(),
    tradeId: r.t.id,
    pnl: r.t.netPnl,
    cumPnl: r.cumPnl,
    balance: dd[i].level,
    cumR: r.cumR,
    returnPct: startingCapital > 0 ? percentOf(r.cumPnl, startingCapital) : null,
    drawdown: dd[i].drawdown,
    drawdownPct: dd[i].drawdownPct,
  }));
}

export interface DailyPoint {
  day: string;
  pnl: number;
  cumPnl: number;
  trades: number;
  wins: number;
  losses: number;
  winRate: number | null;
  rTotal: number | null;
}

export function buildDailySeries(trades: SeriesTrade[], timeZone: string, breakevenTolerance = 0): DailyPoint[] {
  const byDay = new Map<string, SeriesTrade[]>();
  for (const t of trades) {
    const k = dayKey(t.closedAt, timeZone);
    const arr = byDay.get(k) ?? [];
    arr.push(t);
    byDay.set(k, arr);
  }
  const cum = new MoneyAccumulator();
  return [...byDay.keys()].sort().map((day) => {
    const list = byDay.get(day)!;
    const pnl = sumMoney(list.map((t) => t.netPnl));
    cum.add(pnl);
    const wins = list.filter((t) => classifyOutcome(t.netPnl, breakevenTolerance) === "WIN").length;
    const losses = list.filter((t) => classifyOutcome(t.netPnl, breakevenTolerance) === "LOSS").length;
    const rs = list.map((t) => t.rMultiple).filter((r): r is number => r != null);
    return {
      day,
      pnl,
      cumPnl: cum.value,
      trades: list.length,
      wins,
      losses,
      winRate: percentOf(wins, wins + losses),
      rTotal: rs.length ? sumMoney(rs) : null,
    };
  });
}

export interface MonthlyPoint {
  month: string;
  pnl: number;
  trades: number;
  winningDays: number;
  losingDays: number;
}

export function buildMonthlySeries(daily: DailyPoint[]): MonthlyPoint[] {
  const map = new Map<string, DailyPoint[]>();
  for (const d of daily) {
    const k = monthKey(d.day);
    const arr = map.get(k) ?? [];
    arr.push(d);
    map.set(k, arr);
  }
  return [...map.keys()].sort().map((month) => {
    const list = map.get(month)!;
    return {
      month,
      pnl: sumMoney(list.map((d) => d.pnl)),
      trades: list.reduce((a, d) => a + d.trades, 0),
      winningDays: list.filter((d) => d.pnl > 0).length,
      losingDays: list.filter((d) => d.pnl < 0).length,
    };
  });
}

export interface PeriodSummary {
  netPnl: number;
  winningDays: number;
  losingDays: number;
  bestDay: DailyPoint | null;
  worstDay: DailyPoint | null;
  averageDay: number | null;
  totalTrades: number;
}

export function summarizeDays(days: DailyPoint[]): PeriodSummary {
  let best: DailyPoint | null = null;
  let worst: DailyPoint | null = null;
  for (const d of days) {
    if (!best || d.pnl > best.pnl) best = d;
    if (!worst || d.pnl < worst.pnl) worst = d;
  }
  const net = sumMoney(days.map((d) => d.pnl));
  return {
    netPnl: net,
    winningDays: days.filter((d) => d.pnl > 0).length,
    losingDays: days.filter((d) => d.pnl < 0).length,
    bestDay: best,
    worstDay: worst,
    averageDay: days.length ? roundMoney(D(net).div(days.length)) : null,
    totalTrades: days.reduce((a, d) => a + d.trades, 0),
  };
}

/** Distribution buckets for R multiples (e.g. ≤−2, −2..−1, …, ≥3). */
export function rDistribution(rs: number[], edges = [-2, -1, -0.5, 0, 0.5, 1, 2, 3]) {
  const buckets = [
    { label: `≤ ${edges[0]}R`, min: -Infinity, max: edges[0], count: 0 },
    ...edges.slice(0, -1).map((e, i) => ({ label: `${e} to ${edges[i + 1]}R`, min: e, max: edges[i + 1], count: 0 })),
    { label: `≥ ${edges[edges.length - 1]}R`, min: edges[edges.length - 1], max: Infinity, count: 0 },
  ];
  for (const r of rs) {
    const b = r <= edges[0] ? buckets[0] : r >= edges[edges.length - 1] ? buckets[buckets.length - 1] : buckets.find((x) => r >= x.min && r < x.max);
    if (b) b.count += 1;
  }
  return buckets.map(({ label, count }) => ({ label, count }));
}

/** P&L distribution in equal-width buckets. */
export function pnlDistribution(values: number[], bucketCount = 12) {
  if (!values.length) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) return [{ label: min.toFixed(0), from: min, to: max, count: values.length, positive: min > 0 }];
  const width = (max - min) / bucketCount;
  const buckets = Array.from({ length: bucketCount }, (_, i) => ({ from: min + i * width, to: min + (i + 1) * width, count: 0 }));
  for (const v of values) {
    const idx = Math.min(bucketCount - 1, Math.floor((v - min) / width));
    buckets[idx].count += 1;
  }
  return buckets.map((b) => ({ ...b, label: `${b.from.toFixed(0)}…${b.to.toFixed(0)}`, positive: (b.from + b.to) / 2 > 0 }));
}
