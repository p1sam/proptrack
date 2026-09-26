import "server-only";
import type { AccountStatus, AccountType } from "@/generated/prisma/enums";
import { num, numOrNull } from "@/lib/num";
import { prisma } from "../db";
import { getAccountState, getAccountSummary } from "./accounts";

/**
 * Read models for the account detail page (/accounts/[id]). Every query is scoped by userId;
 * the live rule state and economics come from getAccountSummary/getAccountState (calc layer).
 */

export interface RuleDTO {
  profitTargetPct: number | null;
  maxDailyLossPct: number | null;
  dailyLossBasis: "STARTING_BALANCE" | "DAY_START_BALANCE";
  maxOverallLossPct: number | null;
  drawdownType: "STATIC" | "TRAILING_EOD" | "TRAILING_BALANCE";
  trailingLocksAtStart: boolean;
  minTradingDays: number | null;
  maxTradingDays: number | null;
  maxPositionSize: number | null;
  maxOpenContracts: number | null;
  newsTradingAllowed: boolean;
  weekendHoldingAllowed: boolean;
  consistencyPct: number | null;
  payoutThresholdAmount: number | null;
  payoutFrequencyDays: number | null;
  profitSplitPct: number | null;
  dayResetHour: number;
  dayResetTimezone: string | null;
}

type RuleRow = NonNullable<Awaited<ReturnType<typeof prisma.accountRule.findFirst>>>;

export function ruleDTO(rule: RuleRow | null): RuleDTO | null {
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
    maxOpenContracts: numOrNull(rule.maxOpenContracts),
    newsTradingAllowed: rule.newsTradingAllowed,
    weekendHoldingAllowed: rule.weekendHoldingAllowed,
    consistencyPct: numOrNull(rule.consistencyPct),
    payoutThresholdAmount: numOrNull(rule.payoutThresholdAmount),
    payoutFrequencyDays: rule.payoutFrequencyDays,
    profitSplitPct: numOrNull(rule.profitSplitPct),
    dayResetHour: rule.dayResetHour,
    dayResetTimezone: rule.dayResetTimezone,
  };
}

export async function getAccountDetail(userId: string, accountId: string) {
  const [res, state, account] = await Promise.all([
    getAccountSummary(userId, accountId),
    getAccountState(userId, accountId),
    prisma.tradingAccount.findFirst({
      where: { id: accountId, userId },
      include: { rule: true, propFirm: { select: { id: true, name: true } }, fees: { orderBy: { paidAt: "desc" } } },
    }),
  ]);
  if (!res || !state || !account) return null;
  return {
    summary: res.summary,
    prefs: res.prefs,
    state,
    rule: ruleDTO(account.rule),
    notes: account.notes,
    propFirmId: account.propFirmId,
    fees: account.fees.map((f) => ({
      id: f.id,
      type: f.type,
      amount: num(f.amount),
      refunded: num(f.refunded),
      currency: f.currency,
      paidAt: f.paidAt.toISOString(),
      notes: f.notes,
    })),
  };
}
export type AccountDetail = NonNullable<Awaited<ReturnType<typeof getAccountDetail>>>;

export async function getAccountTrades(userId: string, accountId: string, take = 50) {
  const [rows, total] = await Promise.all([
    prisma.trade.findMany({
      where: { userId, accountId },
      orderBy: [{ closedAt: { sort: "desc", nulls: "first" } }, { openedAt: "desc" }],
      take,
      select: {
        id: true,
        symbol: true,
        direction: true,
        status: true,
        openedAt: true,
        closedAt: true,
        quantity: true,
        entryPrice: true,
        exitPrice: true,
        netPnl: true,
        rMultiple: true,
        groupId: true,
        strategy: { select: { name: true } },
      },
    }),
    prisma.trade.count({ where: { userId, accountId } }),
  ]);
  return {
    total,
    rows: rows.map((t) => ({
      id: t.id,
      symbol: t.symbol,
      direction: t.direction,
      status: t.status,
      openedAt: t.openedAt.toISOString(),
      closedAt: t.closedAt?.toISOString() ?? null,
      quantity: num(t.quantity),
      entryPrice: num(t.entryPrice),
      exitPrice: numOrNull(t.exitPrice),
      netPnl: numOrNull(t.netPnl),
      rMultiple: numOrNull(t.rMultiple),
      copied: !!t.groupId,
      strategy: t.strategy?.name ?? null,
    })),
  };
}

export async function getAccountJournal(userId: string, accountId: string, take = 60) {
  const rows = await prisma.trade.findMany({
    where: {
      userId,
      accountId,
      OR: [{ journal: { isNot: null } }, { notes: { not: null } }],
    },
    orderBy: [{ closedAt: { sort: "desc", nulls: "first" } }, { openedAt: "desc" }],
    take,
    select: {
      id: true,
      symbol: true,
      direction: true,
      openedAt: true,
      closedAt: true,
      netPnl: true,
      rMultiple: true,
      notes: true,
      tags: { select: { tag: { select: { id: true, name: true, kind: true } } } },
      journal: { select: { lesson: true, mistakes: true, wentWell: true, wentWrong: true, followedPlan: true, reason: true } },
    },
  });
  return rows.map((t) => ({
    id: t.id,
    symbol: t.symbol,
    direction: t.direction,
    openedAt: t.openedAt.toISOString(),
    closedAt: t.closedAt?.toISOString() ?? null,
    netPnl: numOrNull(t.netPnl),
    rMultiple: numOrNull(t.rMultiple),
    notes: t.notes,
    tags: t.tags.map((x) => x.tag),
    journal: t.journal,
  }));
}

export async function getAccountViolations(userId: string, accountId: string, take = 200) {
  const rows = await prisma.ruleViolation.findMany({
    where: { userId, accountId },
    orderBy: { occurredAt: "desc" },
    take,
    select: { id: true, source: true, severity: true, ruleKey: true, day: true, occurredAt: true, message: true, actual: true, limit: true, tradeId: true },
  });
  return rows.map((v) => ({ ...v, occurredAt: v.occurredAt.toISOString(), actual: numOrNull(v.actual), limit: numOrNull(v.limit) }));
}

export async function getAccountPayouts(userId: string, accountId: string) {
  const rows = await prisma.payout.findMany({ where: { userId, accountId }, orderBy: [{ requestedAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }] });
  return rows.map((p) => ({
    id: p.id,
    status: p.status,
    requestedAt: p.requestedAt?.toISOString() ?? null,
    approvedAt: p.approvedAt?.toISOString() ?? null,
    paidAt: p.paidAt?.toISOString() ?? null,
    amountRequested: num(p.amountRequested),
    amountReceived: numOrNull(p.amountReceived),
    profitSplitPct: numOrNull(p.profitSplitPct),
    fees: num(p.fees),
    paymentMethod: p.paymentMethod,
    currency: p.currency,
    deductFromBalance: p.deductFromBalance,
    notes: p.notes,
  }));
}

export interface LineageAccount {
  id: string;
  name: string;
  status: AccountStatus;
  accountType: AccountType;
  phase: number | null;
  parentAccountId: string | null;
  currency: string;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
}

const MAX_DEPTH = 25;

/**
 * The whole lifecycle chain an account belongs to: every ancestor (parentAccountId) and every
 * descendant (childAccounts), plus the events and payouts of all of them.
 */
export async function getAccountLineage(userId: string, accountId: string) {
  const select = { id: true, name: true, status: true, accountType: true, phase: true, parentAccountId: true, currency: true, startedAt: true, endedAt: true, createdAt: true } as const;
  const self = await prisma.tradingAccount.findFirst({ where: { id: accountId, userId }, select });
  if (!self) return null;
  const byId = new Map([[self.id, self]]);

  // Ancestors
  let parentId = self.parentAccountId;
  for (let i = 0; parentId && i < MAX_DEPTH && !byId.has(parentId); i++) {
    const p = await prisma.tradingAccount.findFirst({ where: { id: parentId, userId }, select });
    if (!p) break;
    byId.set(p.id, p);
    parentId = p.parentAccountId;
  }
  // Descendants of the root (covers siblings, e.g. several reset attempts)
  const root = [...byId.values()].find((a) => !a.parentAccountId || !byId.has(a.parentAccountId)) ?? self;
  let frontier = [root.id];
  for (let i = 0; frontier.length && i < MAX_DEPTH; i++) {
    const kids = await prisma.tradingAccount.findMany({ where: { userId, parentAccountId: { in: frontier } }, select });
    frontier = [];
    for (const k of kids) {
      if (byId.has(k.id)) continue;
      byId.set(k.id, k);
      frontier.push(k.id);
    }
  }

  const ids = [...byId.keys()];
  const [events, payouts] = await Promise.all([
    prisma.accountEvent.findMany({ where: { accountId: { in: ids }, account: { userId } }, orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }] }),
    prisma.payout.findMany({ where: { userId, accountId: { in: ids } }, select: { id: true, accountId: true, status: true, paidAt: true, amountReceived: true, currency: true } }),
  ]);

  const accounts: LineageAccount[] = [...byId.values()]
    .map((a) => ({
      ...a,
      startedAt: a.startedAt?.toISOString() ?? null,
      endedAt: a.endedAt?.toISOString() ?? null,
      createdAt: a.createdAt.toISOString(),
    }))
    .sort((a, b) => (a.startedAt ?? a.createdAt).localeCompare(b.startedAt ?? b.createdAt));

  return {
    accounts,
    events: events.map((e) => ({
      id: e.id,
      accountId: e.accountId,
      type: e.type,
      occurredAt: e.occurredAt.toISOString(),
      amount: numOrNull(e.amount),
      fromStatus: e.fromStatus,
      toStatus: e.toStatus,
      notes: e.notes,
    })),
    payouts: payouts.map((p) => ({ ...p, paidAt: p.paidAt?.toISOString() ?? null, amountReceived: numOrNull(p.amountReceived) })),
  };
}
export type AccountLineage = NonNullable<Awaited<ReturnType<typeof getAccountLineage>>>;
