import "server-only";
import { analyzeTradesPerDay, subsetStats, tagPerformance } from "@/lib/calc/behavior";
import { buildEquitySeries } from "@/lib/calc/equity";
import { mean } from "@/lib/calc/money";
import { RULE_LABELS, type PersonalRuleType } from "@/lib/calc/personal-rules";
import { countExceeding, dailyRiskSeries, riskPctHistogram, samplesNeeded, strictestLimit, summarizeRisk } from "@/lib/calc/risk";
import { dayKey } from "@/lib/calc/time";
import { resolveDateBounds, type TradeFilters } from "@/lib/filters";
import { numOrNull } from "@/lib/num";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "../db";
import { getPrefs } from "./accounts";
import { computeBehavior, statsOf } from "./analytics";
import { datasetNotes, toFilterBarOptions } from "./analytics-page";
import { loadDataset } from "./dataset";
import { getFilterOptions } from "./options";

const DAILY_LOSS_KEYS = ["MAX_DAILY_LOSS", "MAX_DAILY_LOSS_PCT", "MAX_DAILY_LOSS_AMOUNT"];

/**
 * Risk & discipline read model. Trade-level numbers come from the shared analytics dataset
 * (filtered, currency-converted, copies collapsed); rule-break counts come from the stored
 * RuleViolation rows, which are evaluated per account by the rebuild service and so are scoped
 * by account and date filters only.
 */
export async function getRiskPage(userId: string, filters: TradeFilters) {
  const [prefs, ds, options] = await Promise.all([getPrefs(userId), loadDataset(userId, filters), getFilterOptions(userId)]);
  const tol = ds.breakevenTolerance;
  const trades = ds.trades;
  const behavior = computeBehavior(ds);
  const stats = statsOf(trades, ds);
  const minTrades = ds.insightMinTrades;
  const minGroup = Math.max(5, Math.round(minTrades / 2));

  // Scope for rules & violations: same accounts / firms / dates as the trade filters.
  const accountScope =
    filters.accounts.length || filters.firms.length
      ? options.accounts
          .filter((a) => (!filters.accounts.length || filters.accounts.includes(a.id)) && (!filters.firms.length || (a.propFirmId !== null && filters.firms.includes(a.propFirmId))))
          .map((a) => a.id)
      : null;
  const bounds = resolveDateBounds(filters, dayKey(new Date(), prefs.timezone));
  const vWhere: Prisma.RuleViolationWhereInput = {
    userId,
    ...(accountScope ? { accountId: { in: accountScope } } : {}),
    ...(bounds.from || bounds.to ? { day: { ...(bounds.from ? { gte: bounds.from } : {}), ...(bounds.to ? { lte: bounds.to } : {}) } } : {}),
  };

  const [rules, violationGroups, hourViolations, dailyLossDays] = await Promise.all([
    prisma.tradingRule.findMany({
      where: { userId, isActive: true, ...(accountScope ? { OR: [{ accountId: null }, { accountId: { in: accountScope } }] } : {}) },
      include: { account: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.ruleViolation.groupBy({ by: ["ruleKey", "source", "tradingRuleId"], where: vWhere, _count: { _all: true } }),
    prisma.ruleViolation.findMany({ where: { ...vWhere, ruleKey: "TRADING_HOURS", tradeId: { not: null } }, select: { tradeId: true } }),
    prisma.ruleViolation.findMany({
      where: { ...vWhere, ruleKey: { in: DAILY_LOSS_KEYS } },
      distinct: ["accountId", "day", "source"],
      select: { day: true, accountId: true, source: true },
    }),
  ]);
  const vCount = (key: string) => violationGroups.filter((g) => g.ruleKey === key).reduce((a, g) => a + g._count._all, 0);

  // ── Risk ──
  const risk = summarizeRisk(trades);
  const ruleValues = (type: PersonalRuleType) => rules.filter((r) => r.type === type).map((r) => numOrNull(r.value));
  const riskRuleLimit = strictestLimit(ruleValues("MAX_RISK_PER_TRADE_PCT"));
  const riskLimit = riskRuleLimit ?? strictestLimit([prefs.riskPercent]);
  const riskPcts = trades.map((t) => t.riskPercent ?? null);
  const histogram = riskPctHistogram(
    riskPcts.filter((v): v is number => v !== null),
    riskLimit,
  );
  const daily = dailyRiskSeries(trades);
  const equity = buildEquitySeries(trades, ds.startingCapital);
  const last = equity.at(-1);

  // Overtrading: the strictest of the MAX_TRADES_PER_DAY rules and the settings value.
  const tradesRuleLimit = strictestLimit(ruleValues("MAX_TRADES_PER_DAY"));
  const maxTradesPerDay = strictestLimit([tradesRuleLimit, ds.maxTradesPerDay]);
  const tradesPerDay = maxTradesPerDay === ds.maxTradesPerDay ? behavior.tradesPerDay : analyzeTradesPerDay(trades, maxTradesPerDay, tol);

  const ruleChecks = rules.map((r) => {
    const type = r.type as PersonalRuleType;
    const value = numOrNull(r.value);
    const scoped = r.accountId ? trades.filter((t) => t.accountId === r.accountId) : trades;
    const violations = violationGroups.filter((g) => g.tradingRuleId === r.id).reduce((a, g) => a + g._count._all, 0);
    let measured: { exceeded: number; measured: number; pct: number | null; unit: "trades" | "days" } | null = null;
    if (type === "MAX_RISK_PER_TRADE_PCT" && value !== null) measured = { ...countExceeding(scoped.map((t) => t.riskPercent ?? null), value), unit: "trades" };
    if (type === "MAX_TRADES_PER_DAY" && value !== null) measured = { ...countExceeding(dailyRiskSeries(scoped).map((d) => d.trades), value), unit: "days" };
    return {
      id: r.id,
      type,
      label: RULE_LABELS[type],
      value,
      startMinute: r.startMinute,
      endMinute: r.endMinute,
      scope: r.account?.name ?? "All accounts",
      hardLimit: r.hardLimit,
      violations,
      measured,
    };
  });

  // Trades opened outside the user's defined hours (from stored TRADING_HOURS violations).
  const outsideIds = new Set(hourViolations.map((v) => v.tradeId!));
  const isOutside = (t: (typeof trades)[number]) => t.memberIds.some((id) => outsideIds.has(id));
  const outside = trades.filter(isOutside);
  const inside = trades.filter((t) => !isOutside(t));
  const hasHoursRule = rules.some((r) => r.type === "TRADING_HOURS");

  // Most costly mistakes: MISTAKE-kind tags, worst net P&L first.
  const kindOf = new Map(options.tags.map((t) => [t.name, t.kind]));
  const mistakes = tagPerformance(trades, tol)
    .filter((g) => kindOf.get(g.key) === "MISTAKE")
    .map((g) => ({ key: g.key, label: g.label, trades: g.trades, netPnl: g.netPnl, averageR: g.averageR, winRate: g.winRate }));

  const sub = (s: { n: number; winRate: number | null; averageR: number | null; netPnl: number }) => ({ n: s.n, winRate: s.winRate, averageR: s.averageR, netPnl: s.netPnl });
  const seq = behavior.sequences;
  const dailyRisks = daily.map((d) => d.totalRisk);

  return {
    notes: datasetNotes(ds),
    filterOptions: toFilterBarOptions(options),
    currency: ds.currency,
    timezone: prefs.timezone,
    sample: trades.length,
    minTrades,
    minGroup,
    needed: samplesNeeded(trades.length, minTrades),
    risk: {
      ...risk,
      limit: riskLimit,
      limitSource: riskRuleLimit !== null ? ("rule" as const) : riskLimit !== null ? ("settings" as const) : null,
      overLimit: riskLimit !== null ? countExceeding(riskPcts, riskLimit) : null,
      histogram,
      daily,
      avgDailyRisk: dailyRisks.length ? mean(dailyRisks) : null,
      maxDailyRisk: dailyRisks.length ? Math.max(...dailyRisks) : null,
      maxDailyRiskDay: daily.length ? daily.reduce((a, d) => (d.totalRisk > a.totalRisk ? d : a)).day : null,
    },
    streaks: {
      maxConsecutiveLosses: stats.maxConsecutiveLosses,
      currentLossStreak: stats.currentStreak.type === "LOSS" ? stats.currentStreak.count : 0,
    },
    drawdown: { current: last?.drawdown ?? 0, currentPct: last?.drawdownPct ?? null, max: stats.maxDrawdown, maxPct: stats.maxDrawdownPct },
    maxTradesPerDay,
    maxTradesSource: tradesRuleLimit !== null && maxTradesPerDay === tradesRuleLimit ? ("rule" as const) : maxTradesPerDay !== null ? ("settings" as const) : null,
    tradesPerDay,
    ruleChecks,
    violationTotals: {
      tradingHours: vCount("TRADING_HOURS"),
      dailyLossDays: new Set(dailyLossDays.map((d) => `${d.accountId}|${d.day}`)).size,
      dailyLossProp: dailyLossDays.filter((d) => d.source === "PROP_RULE").length,
      dailyLossPersonal: dailyLossDays.filter((d) => d.source === "PERSONAL_RULE").length,
      all: violationGroups.reduce((a, g) => a + g._count._all, 0),
    },
    hasDailyLossRule: rules.some((r) => r.type === "MAX_DAILY_LOSS_PCT" || r.type === "MAX_DAILY_LOSS_AMOUNT"),
    outsideHours: hasHoursRule ? { outside: sub(subsetStats(outside, tol)), inside: sub(subsetStats(inside, tol)) } : null,
    sequences: {
      baseline: sub(seq.baseline),
      afterLoss: sub(seq.afterLoss),
      afterWin: sub(seq.afterWin),
      afterTwoLosses: sub(seq.afterTwoLosses),
      afterFirstLossOfDay: sub(seq.afterFirstLossOfDay),
      avgTradesAfterLoss: seq.avgTradesAfterLoss,
      losingTrades: seq.losingTrades,
    },
    sizing: behavior.sizing,
    rapid: { minutes: behavior.rapid.minutes, rapid: sub(behavior.rapid.rapid), rapidAfterLoss: sub(behavior.rapid.rapidAfterLoss) },
    emotions: behavior.emotions.filter((e) => e.n > 0),
    mistakes,
    insights: behavior.insights,
  };
}
export type RiskPageData = Awaited<ReturnType<typeof getRiskPage>>;
