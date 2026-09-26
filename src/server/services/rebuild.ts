import "server-only";
import { assignSession } from "@/lib/calc/sessions";
import { evaluatePersonalRules, type PersonalRule, type RuleTrade } from "@/lib/calc/personal-rules";
import { computeTrade } from "@/lib/calc/trade";
import { dayKey, zonedParts } from "@/lib/calc/time";
import { num, numOrNull } from "@/lib/num";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "../db";
import { balanceAtFactory, getUserPrefs, stateFromParts, withdrawalsOf } from "./ledger";

const PROP_BREACH_KEYS = new Set(["MAX_DAILY_LOSS", "MAX_OVERALL_LOSS"]);

/**
 * Recompute every derived value of one account from its source records:
 *   1. per-trade P&L, risk, R, risk %, session, trading day, weekday
 *   2. DailyPerformance rows
 *   3. RuleViolation rows (prop-firm rules + personal rules)
 * Deterministic and idempotent — safe to run after any write to the account's trades,
 * exits, payouts, rules or the user's sessions/settings.
 */
export async function rebuildAccount(userId: string, accountId: string) {
  const account = await prisma.tradingAccount.findFirst({ where: { id: accountId, userId }, include: { rule: true } });
  if (!account) return;
  const prefs = await getUserPrefs(userId);
  const [sessions, rules, trades, payouts] = await Promise.all([
    prisma.tradingSession.findMany({ where: { userId, isActive: true } }),
    prisma.tradingRule.findMany({ where: { userId, isActive: true, OR: [{ accountId: null }, { accountId }] } }),
    prisma.trade.findMany({ where: { accountId, userId }, include: { exits: true }, orderBy: [{ closedAt: "asc" }, { openedAt: "asc" }] }),
    prisma.payout.findMany({ where: { accountId, userId } }),
  ]);
  const ruleTz = account.rule?.dayResetTimezone || prefs.timezone;
  const resetHour = account.rule?.dayResetHour ?? 0;
  const start = num(account.startingBalance);

  // 1. Trade-level derivations in two passes: P&L first, then balance-dependent values.
  const computed = trades.map((t) => {
    const c = computeTrade({
      direction: t.direction,
      entryPrice: num(t.entryPrice),
      quantity: num(t.quantity),
      pointValue: num(t.pointValue),
      exits: t.exits.map((e) => ({ price: num(e.price), quantity: num(e.quantity) })),
      stopLoss: numOrNull(t.stopLoss),
      takeProfit: numOrNull(t.takeProfit),
      commission: num(t.commission),
      swap: num(t.swap),
      reportedGrossPnl: numOrNull(t.reportedGrossPnl),
      riskAmountOverride: numOrNull(t.riskAmountOverride),
    });
    const closedAt = c.closed ? (t.exits.length ? new Date(Math.max(...t.exits.map((e) => e.exitedAt.getTime()))) : t.closedAt) : null;
    return { t, c, closedAt };
  });

  const withdrawals = withdrawalsOf({ payouts });
  const balanceAt = balanceAtFactory(start, [
    ...computed.filter((x) => x.closedAt && x.c.netPnl !== null).map((x) => ({ at: x.closedAt!, delta: x.c.netPnl! })),
    ...withdrawals.map((w) => ({ at: w.at, delta: -w.amount })),
  ]);

  const derived = computed.map(({ t, c, closedAt }) => {
    const balanceBefore = balanceAt(t.openedAt);
    const riskPercent = c.initialRisk !== null && balanceBefore > 0 ? Math.round((c.initialRisk / balanceBefore) * 100 * 10000) / 10000 : null;
    return {
      id: t.id,
      status: c.closed ? "CLOSED" : "OPEN",
      closedAt,
      exitPrice: c.exitPrice,
      grossPnl: c.grossPnl,
      netPnl: c.netPnl,
      initialRisk: c.initialRisk,
      riskPercent,
      rMultiple: c.rMultiple,
      plannedRR: c.plannedRR,
      balanceBefore,
      tradingDay: closedAt ? dayKey(closedAt, ruleTz, resetHour) : null,
      weekday: zonedParts(t.openedAt, prefs.timezone).weekday,
      sessionId: assignSession(t.openedAt, sessions)?.id ?? null,
      prev: t,
    };
  });
  const changed = derived.filter((d) => {
    const p = d.prev;
    const same = (a: unknown, b: number | null) => (a === null || a === undefined ? b === null : b !== null && Number(String(a)) === b);
    return !(
      p.status === d.status &&
      (p.closedAt?.getTime() ?? null) === (d.closedAt?.getTime() ?? null) &&
      same(p.exitPrice, d.exitPrice) &&
      same(p.grossPnl, d.grossPnl) &&
      same(p.netPnl, d.netPnl) &&
      same(p.initialRisk, d.initialRisk) &&
      same(p.riskPercent, d.riskPercent) &&
      same(p.rMultiple, d.rMultiple) &&
      same(p.plannedRR, d.plannedRR) &&
      same(p.balanceBefore, d.balanceBefore) &&
      p.tradingDay === d.tradingDay &&
      p.weekday === d.weekday &&
      p.sessionId === d.sessionId
    );
  });

  // 2 & 3 need the refreshed trades, so run the engine on the computed values.
  const state = stateFromParts(
    {
      startingBalance: start,
      startedAt: account.startedAt,
      rule: account.rule,
      payouts,
      trades: computed
        .filter((x) => x.c.closed && x.closedAt && x.c.netPnl !== null)
        .map((x) => ({ id: x.t.id, openedAt: x.t.openedAt, closedAt: x.closedAt!, netPnl: x.c.netPnl!, quantity: num(x.t.quantity), rMultiple: x.c.rMultiple })),
    },
    prefs,
  );

  const ruleTrades: RuleTrade[] = computed.map(({ t, c, closedAt }) => {
    const bb = balanceAt(t.openedAt);
    return {
      id: t.id,
      openedAt: t.openedAt,
      closedAt,
      day: dayKey(t.openedAt, prefs.timezone),
      netPnl: c.netPnl,
      riskPercent: c.initialRisk !== null && bb > 0 ? (c.initialRisk / bb) * 100 : null,
      quantity: num(t.quantity),
    };
  });
  const firstOpenOfDay = new Map<string, Date>();
  for (const rt of ruleTrades) {
    const cur = firstOpenOfDay.get(rt.day);
    if (!cur || rt.openedAt < cur) firstOpenOfDay.set(rt.day, rt.openedAt);
  }
  const personalRules: PersonalRule[] = rules.map((r) => ({
    id: r.id,
    type: r.type,
    value: numOrNull(r.value),
    startMinute: r.startMinute,
    endMinute: r.endMinute,
    hardLimit: r.hardLimit,
  }));
  const personal = evaluatePersonalRules(ruleTrades, personalRules, {
    timezone: prefs.timezone,
    tolerance: prefs.breakevenTolerance,
    dayStartBalance: (day) => {
      const first = firstOpenOfDay.get(day);
      return first ? balanceAt(first) : null;
    },
  });

  await prisma.$transaction([
    ...bulkUpdateTrades(changed),
    prisma.dailyPerformance.deleteMany({ where: { accountId } }),
    prisma.dailyPerformance.createMany({
      data: state.days
        .filter((d) => d.trades > 0)
        .map((d) => ({
          accountId,
          day: d.day,
          trades: d.trades,
          wins: d.wins,
          losses: d.losses,
          grossPnl: d.netPnl,
          netPnl: d.netPnl,
          rTotal: d.rTotal,
          startBalance: d.startBalance,
          endBalance: d.endBalance,
          minBalance: d.minBalance,
        })),
    }),
    prisma.ruleViolation.deleteMany({ where: { accountId } }),
    prisma.ruleViolation.createMany({
      data: [
        ...state.violations.map((v) => ({
          userId,
          accountId,
          tradeId: v.tradeId,
          source: "PROP_RULE" as const,
          severity: PROP_BREACH_KEYS.has(v.ruleKey) ? ("BREACH" as const) : ("WARNING" as const),
          ruleKey: v.ruleKey,
          day: v.day,
          occurredAt: v.occurredAt,
          message: v.message,
          actual: v.actual,
          limit: v.limit,
        })),
        ...personal.map((v) => ({
          userId,
          accountId,
          tradeId: v.tradeId,
          tradingRuleId: v.ruleId,
          source: "PERSONAL_RULE" as const,
          severity: "WARNING" as const,
          ruleKey: v.ruleType,
          day: v.day,
          occurredAt: v.occurredAt,
          message: v.message,
          actual: v.actual,
          limit: v.limit,
        })),
      ],
    }),
  ]);
  return state;
}

interface DerivedRow {
  id: string;
  status: string;
  closedAt: Date | null;
  exitPrice: number | null;
  grossPnl: number | null;
  netPnl: number | null;
  initialRisk: number | null;
  riskPercent: number | null;
  rMultiple: number | null;
  plannedRR: number | null;
  balanceBefore: number;
  tradingDay: string | null;
  weekday: number;
  sessionId: string | null;
}

/** One UPDATE … FROM (VALUES …) per chunk instead of one statement per trade. */
function bulkUpdateTrades(rows: DerivedRow[]) {
  const chunks: DerivedRow[][] = [];
  for (let i = 0; i < rows.length; i += 500) chunks.push(rows.slice(i, i + 500));
  return chunks.map((chunk) => {
    const values = Prisma.join(
      chunk.map(
        (r) =>
          Prisma.sql`(${r.id}, ${r.status}, ${r.closedAt?.toISOString() ?? null}, ${r.exitPrice}, ${r.grossPnl}, ${r.netPnl}, ${r.initialRisk}, ${r.riskPercent}, ${r.rMultiple}, ${r.plannedRR}, ${r.balanceBefore}, ${r.tradingDay}, ${r.weekday}, ${r.sessionId})`,
      ),
    );
    return prisma.$executeRaw`
      UPDATE trades AS t SET
        status = v.status::"TradeStatus",
        "closedAt" = (v.closed_at::timestamptz AT TIME ZONE 'UTC'),
        "exitPrice" = v.exit_price::numeric,
        "grossPnl" = v.gross_pnl::numeric,
        "netPnl" = v.net_pnl::numeric,
        "initialRisk" = v.initial_risk::numeric,
        "riskPercent" = v.risk_percent::numeric,
        "rMultiple" = v.r_multiple::numeric,
        "plannedRR" = v.planned_rr::numeric,
        "balanceBefore" = v.balance_before::numeric,
        "tradingDay" = v.trading_day::text,
        weekday = v.weekday::int,
        "sessionId" = v.session_id::text,
        "updatedAt" = now()
      FROM (VALUES ${values}) AS v(id, status, closed_at, exit_price, gross_pnl, net_pnl, initial_risk, risk_percent, r_multiple, planned_rr, balance_before, trading_day, weekday, session_id)
      WHERE t.id = v.id::text`;
  });
}

export async function rebuildAllAccounts(userId: string) {
  const accounts = await prisma.tradingAccount.findMany({ where: { userId }, select: { id: true } });
  for (const a of accounts) await rebuildAccount(userId, a.id);
}

