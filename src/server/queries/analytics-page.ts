import "server-only";
import type { GroupStats } from "@/lib/calc/stats";
import type { TradeFilters } from "@/lib/filters";
import type { FilterBarOptions } from "@/components/filters/filter-bar";
import { computeAnalytics, statsOf } from "./analytics";
import { loadDataset, type AnalysisTrade, type Dataset } from "./dataset";
import { getFilterOptions, type FilterOptions } from "./options";

/** Serializable subset of the filter options for the (client) FilterBar. */
export function toFilterBarOptions(o: FilterOptions): FilterBarOptions {
  return {
    accounts: o.accounts.map((a) => ({ id: a.id, name: a.name })),
    firms: o.firms,
    strategies: o.strategies.map((s) => ({ id: s.id, name: s.name })),
    symbols: o.symbols,
    sessions: o.sessions.map((s) => ({ id: s.id, name: s.name })),
    setups: o.setups,
    tags: o.tags.map((t) => ({ id: t.id, name: t.name })),
  };
}

/** Dataset facts every analytics surface discloses (copies collapsed, excluded currencies, sample). */
export function datasetNotes(ds: Dataset) {
  return {
    currency: ds.currency,
    timezone: ds.timezone,
    trades: ds.trades.length,
    rawCount: ds.rawCount,
    collapsed: ds.collapsed,
    excluded: ds.excluded,
    startingCapital: ds.startingCapital,
  };
}
export type DatasetNotes = ReturnType<typeof datasetNotes>;

const relabel = (rows: GroupStats[], label: string) => rows.map((r) => (r.key === "__none__" ? { ...r, label } : r));

/** Lightweight trade reference for links (best / worst trade, recent trades). */
export function tradeRef(t: AnalysisTrade | undefined) {
  if (!t) return null;
  return { id: t.id, symbol: t.symbol, direction: t.direction, closeDay: t.closeDay, closedAt: t.closedAt.toISOString(), netPnl: t.netPnl, rMultiple: t.rMultiple ?? null, accountName: t.accountName, copies: t.copies };
}
export type TradeRef = NonNullable<ReturnType<typeof tradeRef>>;

export async function getAnalyticsPage(userId: string, filters: TradeFilters) {
  const [ds, options] = await Promise.all([loadDataset(userId, filters), getFilterOptions(userId)]);
  const a = computeAnalytics(ds);
  const byId = new Map(ds.trades.map((t) => [t.id, t]));
  const g = a.groups;

  // Weekdays Monday-first; hours are listed as traded (the chart fills gaps with empty hours).
  const weekday = [...g.weekday].sort((x, y) => ((Number(x.key) + 6) % 7) - ((Number(y.key) + 6) % 7));

  // Tags: tagPerformance keys by tag name. Mistake tags are flagged so their cost is readable.
  const tagKind = new Map(options.tags.map((t) => [t.name, t.kind]));
  const tags = g.tag.map((r) => ({ ...r, kind: tagKind.get(r.key) ?? "NEUTRAL" }));
  const mistakeNames = new Set(options.tags.filter((t) => t.kind === "MISTAKE").map((t) => t.name));
  const withMistake = ds.trades.filter((t) => t.tagNames?.some((n) => mistakeNames.has(n)));
  const mistakeStats = statsOf(withMistake, ds);

  // Histogram tones: R buckets from rDistribution's default edges — the first four are below 0R.
  const rBuckets = a.distributions.r.map((b, i) => ({ ...b, tone: (i < 4 ? "loss" : "profit") as "loss" | "profit" }));
  const pnlBuckets = a.distributions.pnl.map((b) => ({ label: b.label, from: b.from, to: b.to, count: b.count, tone: (b.positive ? "profit" : "loss") as "profit" | "loss" }));

  return {
    notes: datasetNotes(ds),
    filterOptions: toFilterBarOptions(options),
    stats: a.stats,
    ratios: a.ratios,
    best: tradeRef(a.stats.bestTrade ? byId.get(a.stats.bestTrade.id) : undefined),
    worst: tradeRef(a.stats.worstTrade ? byId.get(a.stats.worstTrade.id) : undefined),
    equity: a.equity.map((p) => ({ at: p.at, cumPnl: p.cumPnl, balance: p.balance, cumR: p.cumR, returnPct: p.returnPct, drawdown: p.drawdown, drawdownPct: p.drawdownPct })),
    daily: a.daily,
    monthly: a.monthly,
    daySummary: a.daySummary,
    groups: {
      strategy: relabel(g.strategy, "No strategy"),
      symbol: g.symbol,
      session: relabel(g.session, "Outside sessions"),
      setup: relabel(g.setup, "No setup"),
      direction: g.direction,
      account: g.account,
      firm: relabel(g.firm, "No prop firm"),
      timeframe: relabel(g.timeframe, "No timeframe"),
      grade: relabel(g.grade, "Ungraded"),
      weekday,
      hour: g.hour,
      tag: tags,
    },
    mistakes: { trades: mistakeStats.totalTrades, netPnl: mistakeStats.netProfit, tagCount: mistakeNames.size },
    distributions: { r: rBuckets, pnl: pnlBuckets, tradesWithR: a.stats.tradesWithR },
  };
}
export type AnalyticsPageData = Awaited<ReturnType<typeof getAnalyticsPage>>;
