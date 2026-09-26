import "server-only";
import { buildDailySeries } from "@/lib/calc/equity";
import { sumMoney } from "@/lib/calc/money";
import { addDaysToKey, dayKey, weekdayOfKey } from "@/lib/calc/time";
import { tradeFilterSchema, type TradeFilters } from "@/lib/filters";
import { num, numOrNull } from "@/lib/num";
import { prisma } from "../db";
import { buildPortfolio, getFxTable, getPrefs, listAccountSummaries } from "./accounts";
import { computeAnalytics, computeBehavior, statsOf } from "./analytics";
import { loadDataset } from "./dataset";

export async function getDashboard(userId: string, filters: TradeFilters) {
  const prefs = await getPrefs(userId);
  const allFilters = tradeFilterSchema.parse({});
  const isAll = JSON.stringify(filters) === JSON.stringify(allFilters) || filters.range === "all";
  const [accounts, fx, allTime, rangedOnly] = await Promise.all([
    listAccountSummaries(userId),
    getFxTable(userId),
    loadDataset(userId, allFilters),
    isAll ? null : loadDataset(userId, filters),
  ]);
  const ranged = rangedOnly ?? allTime;
  const portfolio = buildPortfolio(accounts, prefs.currency, fx);
  const analytics = computeAnalytics(ranged);
  const behavior = computeBehavior(ranged, analytics.groups.session);

  const today = dayKey(new Date(), prefs.timezone);
  const weekStart = addDaysToKey(today, -((weekdayOfKey(today) + 6) % 7));
  const monthStart = `${today.slice(0, 7)}-01`;
  const sumSince = (from: string) => sumMoney(allTime.trades.filter((t) => t.closeDay >= from).map((t) => t.netPnl));
  const allStats = statsOf(allTime.trades, allTime);

  const [recentTrades, violations] = await Promise.all([
    prisma.trade.findMany({
      where: { userId },
      orderBy: [{ closedAt: { sort: "desc", nulls: "first" } }, { openedAt: "desc" }],
      take: 10,
      select: {
        id: true,
        symbol: true,
        direction: true,
        status: true,
        openedAt: true,
        closedAt: true,
        netPnl: true,
        rMultiple: true,
        groupId: true,
        account: { select: { name: true, currency: true } },
        strategy: { select: { name: true } },
      },
    }),
    prisma.ruleViolation.findMany({
      where: { userId },
      orderBy: { occurredAt: "desc" },
      take: 8,
      select: { id: true, message: true, severity: true, source: true, day: true, tradeId: true, account: { select: { id: true, name: true } } },
    }),
  ]);

  const month = today.slice(0, 7);
  return {
    prefs,
    today,
    accounts,
    portfolio,
    kpis: {
      totalPnl: allStats.netProfit,
      todayPnl: sumSince(today),
      weekPnl: sumSince(weekStart),
      monthPnl: sumSince(monthStart),
      winRate: analytics.stats.winRate,
      profitFactor: analytics.stats.profitFactor,
      currentDrawdown: analytics.equity.at(-1)?.drawdown ?? 0,
      currentDrawdownPct: analytics.equity.at(-1)?.drawdownPct ?? null,
      trades: analytics.stats.totalTrades,
    },
    analytics,
    insights: behavior.insights.slice(0, 4),
    behaviorSample: behavior.sample,
    dataset: { currency: ranged.currency, startingCapital: ranged.startingCapital, excluded: ranged.excluded, collapsed: ranged.collapsed, rawCount: ranged.rawCount },
    calendar: { month, days: buildDailySeries(allTime.trades.filter((t) => t.closeDay.startsWith(month)), prefs.timezone, prefs.breakevenTolerance) },
    recentTrades: recentTrades.map((t) => ({
      id: t.id,
      symbol: t.symbol,
      direction: t.direction,
      status: t.status,
      openedAt: t.openedAt.toISOString(),
      closedAt: t.closedAt?.toISOString() ?? null,
      netPnl: t.netPnl === null ? null : num(t.netPnl),
      rMultiple: numOrNull(t.rMultiple),
      copied: !!t.groupId,
      account: t.account.name,
      currency: t.account.currency,
      strategy: t.strategy?.name ?? null,
    })),
    violations,
  };
}
