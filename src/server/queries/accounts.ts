import "server-only";
import { cache } from "react";
import type { AccountStatus } from "@/generated/prisma/enums";
import { computeAccountEconomics, calculatePassRate, calculatePayoutROI, calculateAccountROI } from "@/lib/calc/economics";
import { buildFxTable, convertAmount, sumConverted, type FxTable } from "@/lib/calc/fx";
import { sumMoney, subMoney } from "@/lib/calc/money";
import { STATUS_GROUP, ACTIVE_STATUSES } from "@/lib/labels";
import { num } from "@/lib/num";
import { prisma } from "../db";
import { getUserPrefs, ledgerInclude, stateOf, type LedgerAccount } from "../services/ledger";

export const getFxTable = cache(async (userId: string): Promise<FxTable> => {
  const rates = await prisma.exchangeRate.findMany({ where: { userId } });
  return buildFxTable(rates.map((r) => ({ base: r.base, quote: r.quote, rate: num(r.rate) })));
});

export const getPrefs = cache(getUserPrefs);

function summarize(a: LedgerAccount, prefs: Awaited<ReturnType<typeof getUserPrefs>>) {
  const state = stateOf(a, prefs);
  const fees = a.fees.map((f) => ({ amount: num(f.amount), refunded: num(f.refunded), currency: f.currency }));
  const payouts = a.payouts.map((p) => ({ status: p.status, amountReceived: p.amountReceived === null ? null : num(p.amountReceived), currency: p.currency }));
  const economics = computeAccountEconomics(fees, payouts);
  return {
    id: a.id,
    name: a.name,
    firm: a.propFirm,
    accountNumber: a.accountNumber,
    accountSize: num(a.accountSize),
    startingBalance: num(a.startingBalance),
    currency: a.currency,
    accountType: a.accountType,
    phase: a.phase,
    status: a.status,
    group: STATUS_GROUP[a.status],
    purchasedAt: a.purchasedAt?.toISOString() ?? null,
    startedAt: a.startedAt?.toISOString() ?? null,
    endedAt: a.endedAt?.toISOString() ?? null,
    parentAccountId: a.parentAccountId,
    hasRules: !!a.rule,
    tradeCount: a.trades.length,
    // Live state
    balance: state.balance,
    equity: state.equity,
    tradingPnl: state.tradingPnl,
    totalWithdrawn: state.totalWithdrawn,
    pnlPct: state.pnlPct,
    todayPnl: state.todayPnl,
    todayPnlPct: state.todayPnlPct,
    profitTarget: state.profitTarget,
    dailyLoss: state.dailyLoss,
    overallLoss: state.overallLoss,
    maxDrawdown: state.maxDrawdown,
    maxDrawdownPct: state.maxDrawdownPct,
    currentDrawdown: state.currentDrawdown,
    currentDrawdownPct: state.currentDrawdownPct,
    tradingDays: state.tradingDays,
    minTradingDays: state.minTradingDays,
    consistency: state.consistency,
    payout: state.payout,
    bestDay: state.bestDay ? { day: state.bestDay.day, netPnl: state.bestDay.netPnl } : null,
    worstDay: state.worstDay ? { day: state.worstDay.day, netPnl: state.worstDay.netPnl } : null,
    averageDailyPnl: state.averageDailyPnl,
    breached: state.breached,
    passEligible: state.passEligible,
    warnings: state.warnings,
    violationCount: state.violations.length,
    economics: { ...economics, feeItems: fees, payoutItems: payouts },
  };
}
export type AccountSummary = ReturnType<typeof summarize>;

export const listAccountSummaries = cache(async (userId: string, opts: { includeArchived?: boolean } = {}) => {
  const prefs = await getPrefs(userId);
  const accounts = await prisma.tradingAccount.findMany({
    where: { userId, ...(opts.includeArchived === false ? { status: { not: "ARCHIVED" } } : {}) },
    include: ledgerInclude,
    orderBy: [{ createdAt: "desc" }],
  });
  return accounts.map((a) => summarize(a, prefs));
});

export async function getAccountSummary(userId: string, accountId: string) {
  const prefs = await getPrefs(userId);
  const a = await prisma.tradingAccount.findFirst({ where: { id: accountId, userId }, include: ledgerInclude });
  return a ? { summary: summarize(a, prefs), prefs } : null;
}

/** Full account state including daily series and balance points, for the account detail page. */
export async function getAccountState(userId: string, accountId: string) {
  const prefs = await getPrefs(userId);
  const a = await prisma.tradingAccount.findFirst({ where: { id: accountId, userId }, include: ledgerInclude });
  return a ? stateOf(a, prefs) : null;
}

export interface PortfolioSummary {
  currency: string;
  counts: { total: number; challenge: number; passed: number; funded: number; failed: number; inactive: number; byStatus: Partial<Record<AccountStatus, number>> };
  totalCapital: number;
  combinedEquity: number;
  tradingPnl: number;
  totalFees: number;
  totalPayouts: number;
  netCashFlow: number;
  roiPct: number | null;
  payoutMultiple: number | null;
  passRate: number | null;
  evaluationsResolved: number;
  missingCurrencies: string[];
}

/**
 * Portfolio economics across all accounts, converted to the user's currency. Capital and equity
 * count active accounts only; fees, payouts and trading P&L count every account ever held, since
 * failed challenges cost real money.
 */
export function buildPortfolio(accounts: AccountSummary[], currency: string, fx: FxTable): PortfolioSummary {
  const active = accounts.filter((a) => ACTIVE_STATUSES.includes(a.status));
  const byStatus: Partial<Record<AccountStatus, number>> = {};
  for (const a of accounts) byStatus[a.status] = (byStatus[a.status] ?? 0) + 1;
  const count = (g: string) => accounts.filter((a) => a.group === g).length;
  const missing = new Set<string>();
  const conv = (items: { amount: number; currency: string }[]) => {
    const r = sumConverted(items, currency, fx);
    r.missing.forEach((m) => missing.add(m));
    return r.total;
  };
  const totalFees = conv(accounts.flatMap((a) => a.economics.feeItems.map((f) => ({ amount: subMoney(f.amount, f.refunded), currency: f.currency }))));
  const totalPayouts = conv(accounts.flatMap((a) => a.economics.payoutItems.filter((p) => p.status === "PAID").map((p) => ({ amount: p.amountReceived ?? 0, currency: p.currency }))));
  // Evaluations: accounts that were challenges and are now resolved (passed chain vs failed).
  const evalAccounts = accounts.filter((a) => a.accountType !== "FUNDED" && a.accountType !== "PERSONAL" && a.accountType !== "INSTANT_FUNDED");
  const passed = evalAccounts.filter((a) => a.status === "PASSED" || a.group === "funded").length;
  const failed = evalAccounts.filter((a) => a.group === "failed").length;
  return {
    currency,
    counts: { total: accounts.length, challenge: count("challenge"), passed: count("passed"), funded: count("funded"), failed: count("failed"), inactive: count("inactive"), byStatus },
    totalCapital: conv(active.map((a) => ({ amount: a.accountSize, currency: a.currency }))),
    combinedEquity: conv(active.map((a) => ({ amount: a.equity, currency: a.currency }))),
    tradingPnl: conv(accounts.map((a) => ({ amount: a.tradingPnl, currency: a.currency }))),
    totalFees,
    totalPayouts,
    netCashFlow: subMoney(totalPayouts, totalFees),
    roiPct: calculateAccountROI(totalPayouts, totalFees),
    payoutMultiple: calculatePayoutROI(totalPayouts, totalFees),
    passRate: calculatePassRate(passed, failed),
    evaluationsResolved: passed + failed,
    missingCurrencies: [...missing],
  };
}

export function convertFor(fx: FxTable, target: string) {
  return (amount: number, from: string) => convertAmount(amount, from, target, fx);
}

export { sumMoney };
