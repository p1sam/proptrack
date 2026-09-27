import "server-only";
import { notFound } from "next/navigation";
import { alignCumulative, downsample, lastPerBucket } from "@/lib/calc/compare";
import { buildEquitySeries } from "@/lib/calc/equity";
import { breakdownBy, type GroupStats } from "@/lib/calc/stats";
import { dayKey } from "@/lib/calc/time";
import type { TradeFilters } from "@/lib/filters";
import { prisma } from "../db";
import { computeAnalytics, statsOf } from "./analytics";
import { datasetNotes, toFilterBarOptions, tradeRef } from "./analytics-page";
import { loadDataset, type AnalysisTrade, type Dataset } from "./dataset";
import { getFilterOptions } from "./options";

/** Strategy key used in URLs and filters for trades without a strategy. */
export const NO_STRATEGY = "none";
export const MAX_COMPARE = 4;

const keyOf = (t: AnalysisTrade) => t.strategyId ?? NO_STRATEGY;

function emptyGroup(key: string, label: string): GroupStats {
  return { key, label, trades: 0, wins: 0, losses: 0, winRate: null, netPnl: 0, averageR: null, tradesWithR: 0, profitFactor: null, expectancy: null, maxDrawdown: 0, bestTrade: null, worstTrade: null };
}

/** Daily cumulative P&L and R for one strategy's trades (last value of each close day). */
function cumulativeByDay(trades: AnalysisTrade[], ds: Dataset) {
  const eq = buildEquitySeries(trades);
  const day = (p: (typeof eq)[number]) => dayKey(new Date(p.at), ds.timezone);
  return { money: lastPerBucket(eq, day, (p) => p.cumPnl), r: lastPerBucket(eq, day, (p) => p.cumR) };
}

export async function getStrategiesPage(userId: string, filters: TradeFilters, compare: string[]) {
  const scoped = { ...filters, strategies: [] };
  const [ds, options] = await Promise.all([loadDataset(userId, scoped), getFilterOptions(userId)]);
  const tol = ds.breakevenTolerance;

  const byKey = new Map<string, AnalysisTrade[]>();
  for (const t of ds.trades) {
    const arr = byKey.get(keyOf(t)) ?? [];
    arr.push(t);
    byKey.set(keyOf(t), arr);
  }
  const groups = new Map(breakdownBy(ds.trades, keyOf, undefined, { breakevenTolerance: tol }).map((g) => [g.key, g]));

  const defs = [
    ...options.strategies.map((s) => ({ key: s.id, label: s.name, archived: s.isArchived })),
    { key: NO_STRATEGY, label: "No strategy", archived: false },
  ];
  const rows = defs.map((def) => {
    const g = groups.get(def.key);
    const list = byKey.get(def.key) ?? [];
    return {
      ...(g ? { ...g, label: def.label } : emptyGroup(def.key, def.label)),
      archived: def.archived,
      spark: downsample(buildEquitySeries(list).map((p) => p.cumPnl), 48),
    };
  });

  const labelOf = new Map(defs.map((d) => [d.key, d.label]));
  const selected = [...new Set(compare)].filter((k) => labelOf.has(k)).slice(0, MAX_COMPARE);
  const perSeries = selected.map((key) => {
    const list = byKey.get(key) ?? [];
    return { key, label: labelOf.get(key)!, list, cum: cumulativeByDay(list, ds) };
  });

  return {
    notes: datasetNotes(ds),
    filterOptions: toFilterBarOptions(options),
    rows,
    compare: {
      series: perSeries.map((s) => ({ key: s.key, label: s.label })),
      money: alignCumulative(perSeries.map((s) => ({ key: s.key, points: s.cum.money }))),
      r: alignCumulative(perSeries.map((s) => ({ key: s.key, points: s.cum.r }))),
      stats: perSeries.map((s) => ({ key: s.key, label: s.label, stats: statsOf(s.list, { breakevenTolerance: tol, startingCapital: 0 }) })),
    },
  };
}
export type StrategiesPageData = Awaited<ReturnType<typeof getStrategiesPage>>;
export type StrategyRow = StrategiesPageData["rows"][number];

export async function getStrategyDetail(userId: string, id: string, filters: TradeFilters) {
  const strategy =
    id === NO_STRATEGY
      ? { id: NO_STRATEGY, name: "No strategy", description: "Trades without a strategy assigned." as string | null, isArchived: false }
      : await prisma.strategy.findFirst({ where: { id, userId }, select: { id: true, name: true, description: true, isArchived: true } });
  if (!strategy) notFound();

  const [ds, options] = await Promise.all([loadDataset(userId, { ...filters, strategies: [id] }), getFilterOptions(userId)]);
  const a = computeAnalytics(ds);
  const none = (rows: GroupStats[], label: string) => rows.map((r) => (r.key === "__none__" ? { ...r, label } : r));
  return {
    strategy,
    notes: datasetNotes(ds),
    filterOptions: toFilterBarOptions(options),
    stats: a.stats,
    ratios: a.ratios,
    equity: a.equity.map((p) => ({ at: p.at, cumPnl: p.cumPnl, balance: p.balance, cumR: p.cumR, returnPct: p.returnPct, drawdown: p.drawdown, drawdownPct: p.drawdownPct })),
    daily: a.daily,
    groups: {
      symbol: a.groups.symbol,
      session: none(a.groups.session, "Outside sessions"),
      setup: none(a.groups.setup, "No setup"),
      direction: a.groups.direction,
    },
    recent: [...ds.trades].reverse().slice(0, 20).map((t) => tradeRef(t)!),
  };
}
export type StrategyDetailData = Awaited<ReturnType<typeof getStrategyDetail>>;
