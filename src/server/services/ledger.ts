import "server-only";
import { computeAccountState, type AccountRuleConfig, type AccountState, type LedgerTrade } from "@/lib/calc/account";
import { D, roundMoney } from "@/lib/calc/money";
import { num, numOrNull } from "@/lib/num";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "../db";

/**
 * Loads accounts with everything the account engine needs and computes live AccountState.
 * Used both by the rebuild service (which persists derived data) and by read queries.
 */

export const ledgerInclude = {
  rule: true,
  propFirm: { select: { id: true, name: true } },
  trades: {
    where: { status: "CLOSED" },
    select: { id: true, openedAt: true, closedAt: true, netPnl: true, quantity: true, rMultiple: true },
    orderBy: { closedAt: "asc" },
  },
  payouts: true,
  fees: true,
} satisfies Prisma.TradingAccountInclude;

export type LedgerAccount = Prisma.TradingAccountGetPayload<{ include: typeof ledgerInclude }>;

/** Payouts that debit the trading account: requested/approved/paid with deductFromBalance. */
export function withdrawalsOf(account: Pick<LedgerAccount, "payouts">) {
  return account.payouts
    .filter((p) => p.deductFromBalance && (p.status === "REQUESTED" || p.status === "APPROVED" || p.status === "PAID"))
    .map((p) => ({ id: p.id, at: p.requestedAt ?? p.approvedAt ?? p.paidAt ?? p.createdAt, amount: num(p.amountRequested) }));
}

export function lastPayoutAt(account: Pick<LedgerAccount, "payouts">): Date | null {
  const dates = account.payouts
    .filter((p) => p.status !== "REJECTED" && p.status !== "PENDING")
    .map((p) => p.requestedAt ?? p.paidAt ?? p.approvedAt)
    .filter((d): d is Date => !!d);
  return dates.length ? new Date(Math.max(...dates.map((d) => d.getTime()))) : null;
}

export function ruleConfig(rule: LedgerAccount["rule"]): AccountRuleConfig | null {
  if (!rule) return null;
  return {
    profitTargetPct: numOrNull(rule.profitTargetPct),
    maxDailyLossPct: numOrNull(rule.maxDailyLossPct),
    dailyLossBasis: rule.dailyLossBasis,
    maxOverallLossPct: numOrNull(rule.maxOverallLossPct),
    drawdownType: rule.drawdownType,
    trailingLocksAtStart: rule.trailingLocksAtStart,
    minTradingDays: rule.minTradingDays,
    maxTradingDays: rule.maxTradingDays,
    maxPositionSize: numOrNull(rule.maxPositionSize),
    weekendHoldingAllowed: rule.weekendHoldingAllowed,
    newsTradingAllowed: rule.newsTradingAllowed,
    consistencyPct: numOrNull(rule.consistencyPct),
    payoutThresholdAmount: numOrNull(rule.payoutThresholdAmount),
    payoutFrequencyDays: rule.payoutFrequencyDays,
    profitSplitPct: numOrNull(rule.profitSplitPct),
    dayResetHour: rule.dayResetHour,
    dayResetTimezone: rule.dayResetTimezone,
  };
}

export interface LedgerParts {
  startingBalance: number;
  startedAt: Date | null;
  rule: LedgerAccount["rule"];
  trades: LedgerTrade[];
  payouts: LedgerAccount["payouts"];
}

export function stateFromParts(parts: LedgerParts, opts: { timezone: string; breakevenTolerance: number; now?: Date }): AccountState {
  return computeAccountState({
    startingBalance: parts.startingBalance,
    trades: parts.trades,
    withdrawals: withdrawalsOf(parts),
    rule: ruleConfig(parts.rule),
    timezone: opts.timezone,
    now: opts.now ?? new Date(),
    lastPayoutAt: lastPayoutAt(parts),
    startedAt: parts.startedAt,
    breakevenTolerance: opts.breakevenTolerance,
  });
}

export function stateOf(account: LedgerAccount, opts: { timezone: string; breakevenTolerance: number; now?: Date }): AccountState {
  return stateFromParts(
    {
      startingBalance: num(account.startingBalance),
      startedAt: account.startedAt,
      rule: account.rule,
      payouts: account.payouts,
      trades: account.trades
        .filter((t) => t.closedAt && t.netPnl !== null)
        .map((t) => ({ id: t.id, openedAt: t.openedAt, closedAt: t.closedAt!, netPnl: num(t.netPnl), quantity: num(t.quantity), rMultiple: numOrNull(t.rMultiple) })),
    },
    opts,
  );
}

export async function getUserPrefs(userId: string) {
  const s = await prisma.userSettings.findUnique({ where: { userId } });
  return {
    timezone: s?.timezone ?? "UTC",
    currency: s?.defaultCurrency ?? "USD",
    breakevenTolerance: s ? num(s.breakevenTolerance) : 0,
    insightMinTrades: s?.insightMinTrades ?? 20,
    maxTradesPerDay: s?.maxTradesPerDay ?? null,
    riskPercent: s ? numOrNull(s.riskPercent) : null,
    maxDailyLossPct: s ? numOrNull(s.maxDailyLossPct) : null,
    defaultRR: s ? numOrNull(s.defaultRR) : null,
  };
}
export type UserPrefs = Awaited<ReturnType<typeof getUserPrefs>>;

/**
 * Balance of an account at an instant: starting balance + closed P&L − withdrawals, counting
 * only events strictly before `at`.
 */
export function balanceAtFactory(
  startingBalance: number,
  events: { at: Date; delta: number }[],
): (at: Date) => number {
  const sorted = [...events].sort((a, b) => a.at.getTime() - b.at.getTime());
  const times = sorted.map((e) => e.at.getTime());
  const cum: number[] = [];
  let acc = D(startingBalance);
  for (const e of sorted) {
    acc = acc.plus(D(e.delta));
    cum.push(roundMoney(acc));
  }
  return (at: Date) => {
    const t = at.getTime();
    let lo = 0;
    let hi = times.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (times[mid] < t) lo = mid + 1;
      else hi = mid;
    }
    return lo === 0 ? roundMoney(startingBalance) : cum[lo - 1];
  };
}
