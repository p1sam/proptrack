import { mean, roundMoney, roundRatio, sumMoney } from "./money";

/**
 * Risk-management summaries over closed trades: how much was risked per trade and per day,
 * and how often a personal limit was exceeded. Pure; money is expected in one currency.
 */

const EPS = 1e-9;

export interface RiskTrade {
  id: string;
  day: string;
  riskPercent?: number | null;
  initialRisk?: number | null;
}

export interface RiskSummary {
  trades: number;
  withRiskPct: number;
  withRiskAmount: number;
  avgRiskPct: number | null;
  maxRiskPct: number | null;
  avgRiskAmount: number | null;
  maxRiskAmount: number | null;
}

export function summarizeRisk(trades: RiskTrade[]): RiskSummary {
  const pcts = trades.map((t) => t.riskPercent).filter((v): v is number => v != null && Number.isFinite(v));
  const amts = trades.map((t) => t.initialRisk).filter((v): v is number => v != null && Number.isFinite(v));
  return {
    trades: trades.length,
    withRiskPct: pcts.length,
    withRiskAmount: amts.length,
    avgRiskPct: pcts.length ? roundRatio(mean(pcts)!, 4) : null,
    maxRiskPct: pcts.length ? roundRatio(Math.max(...pcts), 4) : null,
    avgRiskAmount: amts.length ? roundMoney(mean(amts)!) : null,
    maxRiskAmount: amts.length ? Math.max(...amts) : null,
  };
}

export interface HistogramBucket {
  label: string;
  from: number | null;
  to: number | null;
  count: number;
  /** Bucket lies entirely above the limit (when one is given). */
  overLimit: boolean;
}

/**
 * Histogram of risk % per trade. Buckets are (edge_i, edge_i+1]; the first is "≤ first edge" and
 * the last is open-ended. When `limit` is given it is inserted as an edge so "over the rule" is a
 * clean split that agrees with `countExceeding` (a trade exactly at the limit is within it).
 */
export function riskPctHistogram(values: number[], limit?: number | null, baseEdges = [0.25, 0.5, 0.75, 1, 1.5, 2, 3]): HistogramBucket[] {
  const edges = [...new Set([...baseEdges, ...(limit && limit > 0 ? [limit] : [])])].sort((a, b) => a - b);
  const fmt = (n: number) => `${roundRatio(n, 2)}%`;
  const buckets: HistogramBucket[] = [{ label: `≤ ${fmt(edges[0])}`, from: null, to: edges[0], count: 0, overLimit: false }];
  for (let i = 0; i < edges.length - 1; i++) buckets.push({ label: `${fmt(edges[i])}–${fmt(edges[i + 1])}`, from: edges[i], to: edges[i + 1], count: 0, overLimit: false });
  buckets.push({ label: `> ${fmt(edges.at(-1)!)}`, from: edges.at(-1)!, to: null, count: 0, overLimit: false });
  for (const b of buckets) b.overLimit = !!limit && limit > 0 && b.from !== null && b.from >= limit - 1e-9;
  for (const v of values) {
    if (!Number.isFinite(v)) continue;
    const b = buckets.find((x) => (x.from === null || v > x.from + EPS) && (x.to === null || v <= x.to + EPS)) ?? buckets[0];
    b.count++;
  }
  return buckets;
}

export interface DailyRiskPoint {
  day: string;
  trades: number;
  /** Sum of initial risk of trades opened that day (trades without a stop add nothing). */
  totalRisk: number;
  totalRiskPct: number | null;
  withoutRisk: number;
}

export function dailyRiskSeries(trades: RiskTrade[]): DailyRiskPoint[] {
  const map = new Map<string, RiskTrade[]>();
  for (const t of trades) {
    const arr = map.get(t.day) ?? [];
    arr.push(t);
    map.set(t.day, arr);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, list]) => {
      const pcts = list.map((t) => t.riskPercent).filter((v): v is number => v != null);
      return {
        day,
        trades: list.length,
        totalRisk: sumMoney(list.map((t) => t.initialRisk ?? null)),
        totalRiskPct: pcts.length ? roundRatio(pcts.reduce((a, b) => a + b, 0), 4) : null,
        withoutRisk: list.filter((t) => t.initialRisk == null).length,
      };
    });
}

/** How many values exceed `limit` (strictly, with float tolerance). */
export function countExceeding(values: (number | null | undefined)[], limit: number): { exceeded: number; measured: number; pct: number | null } {
  const measured = values.filter((v): v is number => v != null && Number.isFinite(v));
  const exceeded = measured.filter((v) => v > limit + EPS).length;
  return { exceeded, measured: measured.length, pct: measured.length ? roundRatio((exceeded / measured.length) * 100, 2) : null };
}

/** "Needs N more trades" helper: how many more samples until `min` is reached (0 when enough). */
export function samplesNeeded(have: number, min: number): number {
  return Math.max(0, Math.ceil(min) - have);
}

/** The strictest (lowest positive) of several configured limits, or null when none is set. */
export function strictestLimit(values: (number | null | undefined)[]): number | null {
  const xs = values.filter((v): v is number => v != null && Number.isFinite(v) && v > 0);
  return xs.length ? Math.min(...xs) : null;
}
