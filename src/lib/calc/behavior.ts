import { D, mean, percentOf, roundRatio, sumMoney } from "./money";
import { breakdownBy, classifyOutcome, computeTradeStats, type GroupStats, type StatTrade } from "./stats";

/**
 * Behavioural analytics. Every function works on the trader's own closed trades and returns
 * the sample size alongside the result; insight sentences are only produced when the sample
 * clears a minimum, so nothing here is invented or extrapolated from a handful of trades.
 * Sequences are evaluated within a trading day, in open-time order, across all accounts
 * (after copy collapsing), because tilt follows the trader, not the account.
 */

export const EMOTIONS = ["confidence", "stress", "fear", "greed", "patience", "fomo", "revenge", "boredom", "discipline"] as const;
export type Emotion = (typeof EMOTIONS)[number];

export interface BehaviorTrade extends StatTrade {
  openedAt: Date;
  day: string;
  riskPercent?: number | null;
  initialRisk?: number | null;
  tagNames?: string[];
  emotions?: Partial<Record<Emotion, number | null>>;
  followedPlan?: boolean | null;
}

export interface SubsetStats {
  n: number;
  winRate: number | null;
  averageR: number | null;
  tradesWithR: number;
  netPnl: number;
  expectancy: number | null;
}

export function subsetStats(trades: StatTrade[], tolerance = 0): SubsetStats {
  const s = computeTradeStats(trades, { breakevenTolerance: tolerance });
  return { n: s.totalTrades, winRate: s.winRate, averageR: s.averageR, tradesWithR: s.tradesWithR, netPnl: s.netProfit, expectancy: s.expectancy };
}

function byDay<T extends BehaviorTrade>(trades: T[]): T[][] {
  const map = new Map<string, T[]>();
  for (const t of trades) {
    const arr = map.get(t.day) ?? [];
    arr.push(t);
    map.set(t.day, arr);
  }
  return [...map.values()].map((list) => list.sort((a, b) => a.openedAt.getTime() - b.openedAt.getTime() || a.id.localeCompare(b.id)));
}

export interface SequenceAnalysis {
  baseline: SubsetStats;
  afterLoss: SubsetStats;
  afterWin: SubsetStats;
  afterTwoLosses: SubsetStats;
  /** Trades after the first loss of the day (all later trades that day). */
  afterFirstLossOfDay: SubsetStats;
  /** Average number of further trades taken the same day after a losing trade. */
  avgTradesAfterLoss: number | null;
  losingTrades: number;
}

export function analyzeSequences(trades: BehaviorTrade[], tolerance = 0): SequenceAnalysis {
  const afterLoss: BehaviorTrade[] = [];
  const afterWin: BehaviorTrade[] = [];
  const afterTwo: BehaviorTrade[] = [];
  const afterFirst: BehaviorTrade[] = [];
  const followCounts: number[] = [];
  for (const day of byDay(trades)) {
    let firstLossIdx = -1;
    day.forEach((t, i) => {
      const o = classifyOutcome(t.netPnl, tolerance);
      if (o === "LOSS") {
        followCounts.push(day.length - 1 - i);
        if (firstLossIdx === -1) firstLossIdx = i;
      }
      if (i === 0) return;
      const prev = classifyOutcome(day[i - 1].netPnl, tolerance);
      if (prev === "LOSS") afterLoss.push(t);
      if (prev === "WIN") afterWin.push(t);
      if (i >= 2 && prev === "LOSS" && classifyOutcome(day[i - 2].netPnl, tolerance) === "LOSS") afterTwo.push(t);
      if (firstLossIdx !== -1 && i > firstLossIdx) afterFirst.push(t);
    });
  }
  return {
    baseline: subsetStats(trades, tolerance),
    afterLoss: subsetStats(afterLoss, tolerance),
    afterWin: subsetStats(afterWin, tolerance),
    afterTwoLosses: subsetStats(afterTwo, tolerance),
    afterFirstLossOfDay: subsetStats(afterFirst, tolerance),
    avgTradesAfterLoss: followCounts.length ? roundRatio(followCounts.reduce((a, b) => a + b, 0) / followCounts.length, 2) : null,
    losingTrades: followCounts.length,
  };
}

export interface SizingAnalysis {
  /** Pairs (previous trade → next trade, same day) where both have a risk figure. */
  pairsAfterLoss: number;
  pairsAfterWin: number;
  /** Share of post-loss trades whose risk exceeded the losing trade's risk by more than 10%. */
  increasedAfterLossPct: number | null;
  increasedAfterWinPct: number | null;
  avgRiskChangeAfterLossPct: number | null;
  avgRiskChangeAfterWinPct: number | null;
}

/** Does the trader size up after losses? Compares risk (% of balance when known, else money). */
export function analyzeSizingAfterLosses(trades: BehaviorTrade[], tolerance = 0): SizingAnalysis {
  const riskOf = (t: BehaviorTrade) => t.riskPercent ?? t.initialRisk ?? null;
  const loss: number[] = [];
  const win: number[] = [];
  for (const day of byDay(trades)) {
    for (let i = 1; i < day.length; i++) {
      const a = riskOf(day[i - 1]);
      const b = riskOf(day[i]);
      if (a == null || b == null || a <= 0) continue;
      const change = ((b - a) / a) * 100;
      const o = classifyOutcome(day[i - 1].netPnl, tolerance);
      if (o === "LOSS") loss.push(change);
      if (o === "WIN") win.push(change);
    }
  }
  const inc = (xs: number[]) => (xs.length ? percentOf(xs.filter((x) => x > 10).length, xs.length) : null);
  const avg = (xs: number[]) => (xs.length ? roundRatio(xs.reduce((s, x) => s + x, 0) / xs.length, 2) : null);
  return {
    pairsAfterLoss: loss.length,
    pairsAfterWin: win.length,
    increasedAfterLossPct: inc(loss),
    increasedAfterWinPct: inc(win),
    avgRiskChangeAfterLossPct: avg(loss),
    avgRiskChangeAfterWinPct: avg(win),
  };
}

/** Trades opened within `minutes` of the previous trade's close on the same day. */
export function analyzeRapidTrades(trades: BehaviorTrade[], minutes = 10, tolerance = 0) {
  const quick: BehaviorTrade[] = [];
  const quickAfterLoss: BehaviorTrade[] = [];
  for (const day of byDay(trades)) {
    for (let i = 1; i < day.length; i++) {
      const gap = (day[i].openedAt.getTime() - day[i - 1].closedAt.getTime()) / 60_000;
      if (gap >= 0 && gap <= minutes) {
        quick.push(day[i]);
        if (classifyOutcome(day[i - 1].netPnl, tolerance) === "LOSS") quickAfterLoss.push(day[i]);
      }
    }
  }
  return { minutes, rapid: subsetStats(quick, tolerance), rapidAfterLoss: subsetStats(quickAfterLoss, tolerance) };
}

export interface TradeCountBucket {
  label: string;
  days: number;
  netPnl: number;
  avgDayPnl: number | null;
  winRate: number | null;
  averageR: number | null;
}

/** Performance of days grouped by how many trades were taken. */
export function analyzeTradesPerDay(trades: BehaviorTrade[], maxTradesPerDay?: number | null, tolerance = 0) {
  const days = byDay(trades);
  const counts = days.map((d) => d.length);
  const buckets: { label: string; test: (n: number) => boolean }[] = [
    { label: "1 trade", test: (n) => n === 1 },
    { label: "2 trades", test: (n) => n === 2 },
    { label: "3 trades", test: (n) => n === 3 },
    { label: "4–5 trades", test: (n) => n >= 4 && n <= 5 },
    { label: "6+ trades", test: (n) => n >= 6 },
  ];
  const summarize = (label: string, list: BehaviorTrade[][]): TradeCountBucket => {
    const flat = list.flat();
    const s = computeTradeStats(flat, { breakevenTolerance: tolerance });
    const dayPnls = list.map((d) => sumMoney(d.map((t) => t.netPnl)));
    return { label, days: list.length, netPnl: s.netProfit, avgDayPnl: dayPnls.length ? mean(dayPnls) : null, winRate: s.winRate, averageR: s.averageR };
  };
  const byCount = buckets.map((b) => summarize(b.label, days.filter((d) => b.test(d.length)))).filter((b) => b.days > 0);
  const overLimit = maxTradesPerDay ? summarize(`Over ${maxTradesPerDay}/day`, days.filter((d) => d.length > maxTradesPerDay)) : null;
  const withinLimit = maxTradesPerDay ? summarize(`Within ${maxTradesPerDay}/day`, days.filter((d) => d.length <= maxTradesPerDay)) : null;
  return {
    tradingDays: days.length,
    avgTradesPerDay: counts.length ? roundRatio(counts.reduce((a, b) => a + b, 0) / counts.length, 2) : null,
    maxTradesInDay: counts.length ? Math.max(...counts) : 0,
    byCount,
    overLimit,
    withinLimit,
  };
}

export function tagPerformance(trades: BehaviorTrade[], tolerance = 0): GroupStats[] {
  return breakdownBy(trades, (t) => (t.tagNames?.length ? t.tagNames : null), undefined, { breakevenTolerance: tolerance })
    .filter((g) => g.key !== "__none__")
    .sort((a, b) => a.netPnl - b.netPnl);
}

export function pearson(xs: number[], ys: number[]): number | null {
  const n = xs.length;
  if (n < 3 || n !== ys.length) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    dx += (xs[i] - mx) ** 2;
    dy += (ys[i] - my) ** 2;
  }
  if (dx === 0 || dy === 0) return null;
  return roundRatio(num / Math.sqrt(dx * dy), 3);
}

export interface EmotionAnalysis {
  emotion: Emotion;
  n: number;
  correlationWithR: number | null;
  levels: { level: number; n: number; averageR: number | null; winRate: number | null; netPnl: number }[];
}

export function analyzeEmotions(trades: BehaviorTrade[], tolerance = 0): EmotionAnalysis[] {
  return EMOTIONS.map((emotion) => {
    const rated = trades.filter((t) => t.emotions?.[emotion] != null);
    const withR = rated.filter((t) => t.rMultiple != null);
    const levels = [1, 2, 3, 4, 5].map((level) => {
      const list = rated.filter((t) => t.emotions?.[emotion] === level);
      const s = subsetStats(list, tolerance);
      return { level, n: s.n, averageR: s.averageR, winRate: s.winRate, netPnl: s.netPnl };
    });
    return {
      emotion,
      n: rated.length,
      correlationWithR: pearson(withR.map((t) => t.emotions![emotion]!), withR.map((t) => t.rMultiple!)),
      levels,
    };
  });
}

// ─── Insight sentences ──────────────────────────────────────────────────────

export interface Insight {
  id: string;
  tone: "positive" | "negative" | "neutral";
  text: string;
  sample: number;
}

const fmtR = (r: number) => `${r >= 0 ? "+" : ""}${r.toFixed(2)}R`;
const fmtPct = (p: number) => `${p.toFixed(0)}%`;

/**
 * Turn analysis results into plain statements. `minTrades` gates the whole set; `minGroup`
 * gates each subgroup. Statements are descriptive (what happened in the data), never advice.
 */
export function buildInsights(input: {
  trades: BehaviorTrade[];
  minTrades: number;
  minGroup?: number;
  tolerance?: number;
  sessions?: GroupStats[];
  maxTradesPerDay?: number | null;
}): Insight[] {
  const { trades, minTrades } = input;
  const minGroup = input.minGroup ?? Math.max(5, Math.round(minTrades / 2));
  const tol = input.tolerance ?? 0;
  if (trades.length < minTrades) return [];
  const out: Insight[] = [];
  const seq = analyzeSequences(trades, tol);
  const base = seq.baseline;

  if (seq.afterTwoLosses.n >= minGroup && seq.afterTwoLosses.winRate !== null && base.winRate !== null) {
    out.push({
      id: "after-two-losses",
      tone: seq.afterTwoLosses.winRate < base.winRate ? "negative" : "neutral",
      text: `Trades taken after 2 consecutive losses have a ${fmtPct(seq.afterTwoLosses.winRate)} win rate (overall ${fmtPct(base.winRate)}).`,
      sample: seq.afterTwoLosses.n,
    });
  }
  if (seq.afterLoss.n >= minGroup && seq.afterLoss.averageR !== null && base.averageR !== null) {
    out.push({
      id: "after-loss-r",
      tone: seq.afterLoss.averageR < base.averageR ? "negative" : "positive",
      text: `Trades right after a loss average ${fmtR(seq.afterLoss.averageR)} versus ${fmtR(base.averageR)} overall.`,
      sample: seq.afterLoss.n,
    });
  }
  if (seq.losingTrades >= minGroup && seq.avgTradesAfterLoss !== null) {
    out.push({
      id: "trades-after-loss",
      tone: "neutral",
      text: `After a losing trade you take on average ${seq.avgTradesAfterLoss.toFixed(1)} more trades the same day.`,
      sample: seq.losingTrades,
    });
  }
  if (seq.afterFirstLossOfDay.n >= minGroup && seq.afterFirstLossOfDay.averageR !== null) {
    out.push({
      id: "after-first-loss",
      tone: seq.afterFirstLossOfDay.averageR < 0 ? "negative" : "positive",
      text: `Your average R after your first loss of the day is ${fmtR(seq.afterFirstLossOfDay.averageR)}.`,
      sample: seq.afterFirstLossOfDay.n,
    });
  }

  const sizing = analyzeSizingAfterLosses(trades, tol);
  if (sizing.pairsAfterLoss >= minGroup && sizing.increasedAfterLossPct !== null) {
    out.push({
      id: "size-after-loss",
      tone: sizing.increasedAfterLossPct >= 30 ? "negative" : "neutral",
      text: `You increased risk by more than 10% on ${fmtPct(sizing.increasedAfterLossPct)} of trades that followed a loss${
        sizing.increasedAfterWinPct !== null ? ` (after wins: ${fmtPct(sizing.increasedAfterWinPct)})` : ""
      }.`,
      sample: sizing.pairsAfterLoss,
    });
  }

  const rapid = analyzeRapidTrades(trades, 10, tol);
  if (rapid.rapidAfterLoss.n >= minGroup && rapid.rapidAfterLoss.averageR !== null) {
    out.push({
      id: "rapid-after-loss",
      tone: rapid.rapidAfterLoss.averageR < 0 ? "negative" : "neutral",
      text: `Trades opened within 10 minutes of closing a loss average ${fmtR(rapid.rapidAfterLoss.averageR)}.`,
      sample: rapid.rapidAfterLoss.n,
    });
  }

  for (const tag of tagPerformance(trades, tol)) {
    if (tag.trades < minGroup || tag.averageR === null) continue;
    if (Math.abs(tag.averageR - (base.averageR ?? 0)) < 0.25) continue;
    out.push({
      id: `tag-${tag.key}`,
      tone: tag.averageR < (base.averageR ?? 0) ? "negative" : "positive",
      text: `Trades tagged “${tag.label}” average ${fmtR(tag.averageR)} (net ${tag.netPnl.toFixed(2)}).`,
      sample: tag.trades,
    });
  }

  const sessions = (input.sessions ?? []).filter((s) => s.trades >= minGroup && s.averageR !== null && s.key !== "__none__");
  if (sessions.length >= 2) {
    const best = [...sessions].sort((a, b) => b.averageR! - a.averageR!)[0];
    out.push({
      id: "best-session-r",
      tone: best.averageR! > 0 ? "positive" : "neutral",
      text: `${best.label} session produces your highest average R (${fmtR(best.averageR!)} over ${best.trades} trades).`,
      sample: best.trades,
    });
  }

  if (input.maxTradesPerDay) {
    const tpd = analyzeTradesPerDay(trades, input.maxTradesPerDay, tol);
    if (tpd.overLimit && tpd.overLimit.days >= 3 && tpd.overLimit.avgDayPnl !== null && tpd.withinLimit?.avgDayPnl != null) {
      out.push({
        id: "overtrading-days",
        tone: tpd.overLimit.avgDayPnl < tpd.withinLimit.avgDayPnl ? "negative" : "neutral",
        text: `On ${tpd.overLimit.days} days with more than ${input.maxTradesPerDay} trades you averaged ${tpd.overLimit.avgDayPnl.toFixed(2)} per day, versus ${tpd.withinLimit.avgDayPnl.toFixed(2)} on other days.`,
        sample: tpd.overLimit.days,
      });
    }
  }

  const followed = trades.filter((t) => t.followedPlan === true);
  const broke = trades.filter((t) => t.followedPlan === false);
  if (followed.length >= minGroup && broke.length >= minGroup) {
    const f = subsetStats(followed, tol);
    const b = subsetStats(broke, tol);
    if (f.averageR !== null && b.averageR !== null) {
      out.push({
        id: "plan-adherence",
        tone: f.averageR > b.averageR ? "positive" : "neutral",
        text: `When you followed your plan you averaged ${fmtR(f.averageR)}; when you didn't, ${fmtR(b.averageR)}.`,
        sample: followed.length + broke.length,
      });
    }
  }

  for (const e of analyzeEmotions(trades, tol)) {
    if (e.n < minTrades || e.correlationWithR === null || Math.abs(e.correlationWithR) < 0.3) continue;
    out.push({
      id: `emotion-${e.emotion}`,
      tone: "neutral",
      text: `${e.emotion[0].toUpperCase()}${e.emotion.slice(1)} ratings show a ${e.correlationWithR > 0 ? "positive" : "negative"} correlation with R (r = ${e.correlationWithR.toFixed(2)}).`,
      sample: e.n,
    });
  }
  return out;
}

export function sumR(trades: StatTrade[]): number | null {
  const rs = trades.map((t) => t.rMultiple).filter((r): r is number => r != null);
  return rs.length ? D(sumMoney(rs)).toNumber() : null;
}
