import "server-only";
import {
  analyzeEmotions,
  analyzeRapidTrades,
  analyzeSequences,
  analyzeSizingAfterLosses,
  analyzeTradesPerDay,
  buildInsights,
  tagPerformance,
} from "@/lib/calc/behavior";
import { buildDailySeries, buildEquitySeries, buildMonthlySeries, pnlDistribution, rDistribution, summarizeDays } from "@/lib/calc/equity";
import { D } from "@/lib/calc/money";
import { breakdownBy, calculateRiskAdjustedRatios, computeTradeStats, type GroupStats } from "@/lib/calc/stats";
import { WEEKDAY_NAMES } from "@/lib/calc/time";
import type { AnalysisTrade, Dataset } from "./dataset";

export function statsOf(trades: AnalysisTrade[], ds: Pick<Dataset, "breakevenTolerance" | "startingCapital">) {
  const s = computeTradeStats(trades, { breakevenTolerance: ds.breakevenTolerance, startingCapital: ds.startingCapital || undefined });
  return {
    ...s,
    bestTrade: s.bestTrade ? { id: s.bestTrade.id, netPnl: s.bestTrade.netPnl } : null,
    worstTrade: s.worstTrade ? { id: s.worstTrade.id, netPnl: s.worstTrade.netPnl } : null,
  };
}
export type StatsDTO = ReturnType<typeof statsOf>;

/** Daily returns (%) on running capital, for Sharpe/Sortino. */
export function dailyReturns(daily: { pnl: number }[], startingCapital: number): number[] {
  if (startingCapital <= 0) return [];
  let capital = D(startingCapital);
  const out: number[] = [];
  for (const d of daily) {
    if (capital.lte(0)) break;
    out.push(D(d.pnl).div(capital).times(100).toNumber());
    capital = capital.plus(d.pnl);
  }
  return out;
}

const sortGroups = (g: GroupStats[]) => [...g].sort((a, b) => b.trades - a.trades);

export function breakdowns(trades: AnalysisTrade[], tol: number) {
  const o = { breakevenTolerance: tol };
  const names = <K extends keyof AnalysisTrade>(key: K, label: keyof AnalysisTrade) => {
    const m = new Map<string, string>();
    for (const t of trades) if (t[key]) m.set(String(t[key]), String(t[label] ?? t[key]));
    return (k: string) => m.get(k) ?? k;
  };
  return {
    strategy: sortGroups(breakdownBy(trades, (t) => t.strategyId, names("strategyId", "strategyName"), o)),
    symbol: sortGroups(breakdownBy(trades, (t) => t.symbol, undefined, o)),
    session: sortGroups(breakdownBy(trades, (t) => t.sessionId, names("sessionId", "sessionName"), o)),
    setup: sortGroups(breakdownBy(trades, (t) => t.setup, undefined, o)),
    direction: breakdownBy(trades, (t) => t.direction, (k) => (k === "LONG" ? "Long" : "Short"), o),
    account: sortGroups(breakdownBy(trades, (t) => (t.copies > 1 ? "__copies__" : t.accountId), (k) => (k === "__copies__" ? "Copied across accounts" : names("accountId", "accountName")(k)), o)),
    firm: sortGroups(breakdownBy(trades, (t) => t.firmId, names("firmId", "firmName"), o)),
    timeframe: sortGroups(breakdownBy(trades, (t) => t.timeframe, undefined, o)),
    grade: breakdownBy(trades, (t) => t.grade, (k) => k.replace("_PLUS", "+"), o).sort((a, b) => a.label.localeCompare(b.label)),
    weekday: breakdownBy(trades, (t) => String(t.weekday), (k) => WEEKDAY_NAMES[Number(k)], o).sort((a, b) => Number(a.key) - Number(b.key)),
    hour: breakdownBy(trades, (t) => String(t.hour).padStart(2, "0"), (k) => `${k}:00`, o).sort((a, b) => a.key.localeCompare(b.key)),
    tag: tagPerformance(trades, tol),
  };
}

export function computeAnalytics(ds: Dataset) {
  const { trades, breakevenTolerance: tol, startingCapital, timezone } = ds;
  const stats = statsOf(trades, ds);
  const equity = buildEquitySeries(trades, startingCapital);
  const daily = buildDailySeries(trades.map((t) => ({ ...t, closedAt: t.closedAt })), timezone, tol);
  const monthly = buildMonthlySeries(daily);
  const ratios = calculateRiskAdjustedRatios(dailyReturns(daily, startingCapital));
  const groups = breakdowns(trades, tol);
  return {
    stats,
    ratios,
    equity,
    daily,
    monthly,
    daySummary: summarizeDays(daily),
    groups,
    distributions: {
      r: rDistribution(trades.map((t) => t.rMultiple).filter((r): r is number => r != null)),
      pnl: pnlDistribution(trades.map((t) => t.netPnl)),
    },
  };
}
export type AnalyticsDTO = ReturnType<typeof computeAnalytics>;

export function computeBehavior(ds: Dataset, sessionGroups?: GroupStats[]) {
  const { trades, breakevenTolerance: tol } = ds;
  return {
    sequences: analyzeSequences(trades, tol),
    sizing: analyzeSizingAfterLosses(trades, tol),
    rapid: analyzeRapidTrades(trades, 10, tol),
    tradesPerDay: analyzeTradesPerDay(trades, ds.maxTradesPerDay, tol),
    emotions: analyzeEmotions(trades, tol),
    insights: buildInsights({
      trades,
      minTrades: ds.insightMinTrades,
      tolerance: tol,
      sessions: sessionGroups ?? breakdowns(trades, tol).session,
      maxTradesPerDay: ds.maxTradesPerDay,
    }),
    sample: trades.length,
    minTrades: ds.insightMinTrades,
  };
}
export type BehaviorDTO = ReturnType<typeof computeBehavior>;
