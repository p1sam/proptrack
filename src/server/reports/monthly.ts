import "server-only";
import { dayKey } from "@/lib/calc/time";
import type { TradeFilters } from "@/lib/filters";
import { prisma } from "../db";
import { getPrefs } from "../queries/accounts";
import { computeAnalytics, computeBehavior } from "../queries/analytics";
import { loadDataset } from "../queries/dataset";
import { averageEmotions, followedPlanRate, isMonthKey, monthBounds, topMistakeTags } from "./aggregations";

/** Default report month: the current month in the user's timezone. */
export async function defaultReportMonth(userId: string): Promise<string> {
  const prefs = await getPrefs(userId);
  return dayKey(new Date(), prefs.timezone).slice(0, 7);
}

/**
 * Monthly performance report data. The month replaces any range in the filters; every other
 * filter (accounts, firms, strategies, …) still applies. All numbers come from the analytics
 * pipeline (loadDataset → computeAnalytics / computeBehavior), so they match the app.
 */
export async function buildMonthlyReport(userId: string, month: string, filters: TradeFilters) {
  if (!isMonthKey(month)) throw new Error("Invalid month");
  const { from, to } = monthBounds(month);
  const scoped: TradeFilters = { ...filters, range: undefined, from, to };
  const [ds, raw, mistakeTags] = await Promise.all([
    loadDataset(userId, scoped),
    loadDataset(userId, scoped, { collapse: false }),
    prisma.tradeTag.findMany({ where: { userId, kind: "MISTAKE" }, select: { name: true } }),
  ]);
  const analytics = computeAnalytics(ds);
  const behavior = computeBehavior(ds, analytics.groups.session);

  // Accounts included: every account with at least one closed copy in the month (money view).
  const accountMap = new Map<string, { name: string; firm: string | null; trades: number }>();
  for (const t of raw.trades) {
    const cur = accountMap.get(t.accountId) ?? { name: t.accountName, firm: t.firmName, trades: 0 };
    cur.trades += 1;
    accountMap.set(t.accountId, cur);
  }

  return {
    month,
    from,
    to,
    currency: ds.currency,
    timezone: ds.timezone,
    generatedAt: new Date().toISOString(),
    collapsed: ds.collapsed,
    rawCount: ds.rawCount,
    excluded: ds.excluded,
    startingCapital: ds.startingCapital,
    accounts: [...accountMap.values()].sort((a, b) => a.name.localeCompare(b.name)),
    stats: analytics.stats,
    daySummary: analytics.daySummary,
    daily: analytics.daily,
    strategies: analytics.groups.strategy,
    instruments: analytics.groups.symbol,
    psychology: {
      emotions: averageEmotions(ds.trades),
      followedPlan: followedPlanRate(ds.trades),
      mistakes: topMistakeTags(analytics.groups.tag, mistakeTags.map((t) => t.name)),
      afterLoss: behavior.sequences.afterLoss,
      baseline: behavior.sequences.baseline,
    },
    insights: behavior.insights.slice(0, 5),
    minTrades: behavior.minTrades,
  };
}
export type MonthlyReport = Awaited<ReturnType<typeof buildMonthlyReport>>;
