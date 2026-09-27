import "server-only";
import { resolveDateBounds, type TradeFilters } from "@/lib/filters";
import { dayKey, WEEKDAY_NAMES } from "@/lib/calc/time";
import { prisma } from "../db";
import { buildMonthlyReport } from "../reports/monthly";
import { buildPropFirmReport } from "../reports/prop-firms";
import { getPrefs } from "./accounts";
import { buildTradeWhere } from "./trade-where";
import { getFilterOptions } from "./options";

/**
 * Human-readable summary of the active filters, for report headers. `ignoreRange` drops date
 * filters (the monthly report sets its own); `only` restricts to specific keys.
 */
export async function describeFilters(userId: string, f: TradeFilters, opts: { ignoreRange?: boolean; only?: (keyof TradeFilters)[] } = {}): Promise<string | null> {
  const o = await getFilterOptions(userId);
  const want = (k: keyof TradeFilters) => !opts.only || opts.only.includes(k);
  const names = (ids: string[], list: { id: string; name: string }[]) => ids.map((id) => (id === "none" ? "None" : list.find((x) => x.id === id)?.name ?? "Unknown")).join(", ");
  const parts: string[] = [];
  if (want("accounts") && f.accounts.length) parts.push(`accounts: ${names(f.accounts, o.accounts)}`);
  if (want("firms") && f.firms.length) parts.push(`firms: ${names(f.firms, o.firms)}`);
  if (want("strategies") && f.strategies.length) parts.push(`strategies: ${names(f.strategies, o.strategies)}`);
  if (want("symbols") && f.symbols.length) parts.push(`instruments: ${f.symbols.join(", ")}`);
  if (want("sessions") && f.sessions.length) parts.push(`sessions: ${names(f.sessions, o.sessions)}`);
  if (want("setups") && f.setups.length) parts.push(`setups: ${f.setups.join(", ")}`);
  if (want("tags") && f.tags.length) parts.push(`tags: ${names(f.tags, o.tags)}`);
  if (want("weekdays") && f.weekdays.length) parts.push(`weekdays: ${f.weekdays.map((d) => WEEKDAY_NAMES[Number(d)] ?? d).join(", ")}`);
  if (want("direction") && f.direction) parts.push(f.direction === "LONG" ? "longs only" : "shorts only");
  if (want("outcome") && f.outcome) parts.push(`${f.outcome.toLowerCase()}s only`);
  if (want("minPnl") && f.minPnl !== undefined) parts.push(`net ≥ ${f.minPnl}`);
  if (want("maxPnl") && f.maxPnl !== undefined) parts.push(`net ≤ ${f.maxPnl}`);
  if (want("minR") && f.minR !== undefined) parts.push(`R ≥ ${f.minR}`);
  if (want("maxR") && f.maxR !== undefined) parts.push(`R ≤ ${f.maxR}`);
  if (want("emotion") && f.emotion) parts.push(`${f.emotion} ${f.emotionMin ?? 1}–${f.emotionMax ?? 5}`);
  if (want("q") && f.q) parts.push(`search "${f.q}"`);
  if (!opts.ignoreRange && want("range")) {
    const prefs = await getPrefs(userId);
    const b = resolveDateBounds(f, dayKey(new Date(), prefs.timezone));
    if (b.from || b.to) parts.push(`${b.from ?? "start"} to ${b.to ?? "today"}`);
  }
  return parts.length ? parts.join("; ") : null;
}

/** Key numbers for the on-page previews of each report. */
export async function getReportsPreview(userId: string, filters: TradeFilters, month: string) {
  const prefs = await getPrefs(userId);
  const where = buildTradeWhere(userId, filters, { timezone: prefs.timezone, tolerance: prefs.breakevenTolerance });
  const [tradeRows, openRows, grouped, monthly, firms, filterNote] = await Promise.all([
    prisma.trade.count({ where }),
    prisma.trade.count({ where: { AND: [where, { status: "OPEN" }] } }),
    prisma.trade.findMany({ where: { AND: [where, { groupId: { not: null } }] }, distinct: ["groupId"], select: { groupId: true } }),
    buildMonthlyReport(userId, month, filters),
    buildPropFirmReport(userId, filters),
    describeFilters(userId, filters),
  ]);
  const accounts = await prisma.trade.findMany({ where, distinct: ["accountId"], select: { accountId: true } });
  return {
    currency: prefs.currency,
    timezone: prefs.timezone,
    filterNote,
    trades: { rows: tradeRows, open: openRows, groups: grouped.length, accounts: accounts.length },
    monthly: {
      month: monthly.month,
      netPnl: monthly.stats.netProfit,
      trades: monthly.stats.totalTrades,
      winRate: monthly.stats.winRate,
      profitFactor: monthly.stats.profitFactor,
      maxDrawdown: monthly.stats.maxDrawdown,
      tradingDays: monthly.daily.length,
      accounts: monthly.accounts.length,
      followedPlanPct: monthly.psychology.followedPlan.pct,
      topMistake: monthly.psychology.mistakes[0] ? { label: monthly.psychology.mistakes[0].label, netPnl: monthly.psychology.mistakes[0].netPnl } : null,
      excluded: monthly.excluded,
    },
    firms: {
      accounts: firms.counts.total,
      purchased: firms.counts.purchased,
      passed: firms.counts.passed,
      failed: firms.counts.failed,
      funded: firms.counts.funded,
      passRate: firms.counts.passRate,
      fees: firms.portfolio.totalFees,
      payouts: firms.portfolio.totalPayouts,
      netCashFlow: firms.portfolio.netCashFlow,
      roiPct: firms.portfolio.roiPct,
      payoutMultiple: firms.portfolio.payoutMultiple,
      payoutCount: firms.payouts.length,
      firmCount: firms.firms.length,
      missing: firms.portfolio.missingCurrencies,
      filtered: firms.filtered,
    },
  };
}
export type ReportsPreview = Awaited<ReturnType<typeof getReportsPreview>>;
