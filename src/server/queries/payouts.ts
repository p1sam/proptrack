import "server-only";
import { z } from "zod";
import { calculatePayoutROI } from "@/lib/calc/economics";
import { convertAmount, sumConverted } from "@/lib/calc/fx";
import { subMoney } from "@/lib/calc/money";
import { computePayoutStats, type PayoutStatItem } from "@/lib/calc/payouts";
import { dayKey } from "@/lib/calc/time";
import { num, numOrNull } from "@/lib/num";
import type { AccountStatus, PayoutStatus } from "@/generated/prisma/enums";
import { prisma } from "../db";
import { getFxTable, getPrefs, listAccountSummaries } from "./accounts";

/** URL filters of the payouts page. */
const list = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform((v) => (v === undefined ? [] : (Array.isArray(v) ? v : v.split(",")).map((s) => s.trim()).filter(Boolean)));
export const payoutFilterSchema = z.object({
  accounts: list,
  firms: list,
  statuses: list.transform((v) => v.filter((s): s is PayoutStatus => ["PENDING", "REQUESTED", "APPROVED", "PAID", "REJECTED"].includes(s))),
  year: z
    .string()
    .regex(/^\d{4}$/)
    .optional()
    .catch(undefined),
});
export type PayoutFilters = z.infer<typeof payoutFilterSchema>;

export function parsePayoutFilters(sp: Record<string, string | string[] | undefined>): PayoutFilters {
  const r = payoutFilterSchema.safeParse(sp);
  return r.success ? r.data : payoutFilterSchema.parse({});
}

const FUNDED_STATUSES: AccountStatus[] = ["FUNDED", "PAYOUT_ELIGIBLE", "PAYOUT_RECEIVED"];

export interface PayoutRowDTO {
  id: string;
  accountId: string;
  accountName: string;
  accountStatus: AccountStatus;
  firmId: string | null;
  firmName: string | null;
  status: PayoutStatus;
  requestedAt: string | null;
  approvedAt: string | null;
  paidAt: string | null;
  amountRequested: number;
  amountReceived: number | null;
  profitSplitPct: number | null;
  fees: number;
  paymentMethod: string | null;
  currency: string;
  accountCurrency: string;
  deductFromBalance: boolean;
  notes: string | null;
}

/** Everything the payouts page renders. Money across payouts is converted to the user currency. */
export async function getPayoutsPage(userId: string, filters: PayoutFilters) {
  const [prefs, fx, accounts, rows] = await Promise.all([
    getPrefs(userId),
    getFxTable(userId),
    listAccountSummaries(userId),
    prisma.payout.findMany({
      where: { userId },
      include: { account: { select: { id: true, name: true, status: true, currency: true, propFirm: { select: { id: true, name: true } } } } },
      orderBy: [{ requestedAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
    }),
  ]);
  const ccy = prefs.currency;
  const tz = prefs.timezone;
  const now = new Date();

  const all: PayoutRowDTO[] = rows.map((p) => ({
    id: p.id,
    accountId: p.accountId,
    accountName: p.account.name,
    accountStatus: p.account.status,
    firmId: p.account.propFirm?.id ?? null,
    firmName: p.account.propFirm?.name ?? null,
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
    accountCurrency: p.account.currency,
    deductFromBalance: p.deductFromBalance,
    notes: p.notes,
  }));

  // Year = year of the payment date, or of the request date for unpaid payouts.
  const yearOf = (p: PayoutRowDTO) => {
    const d = p.paidAt ?? p.requestedAt ?? p.approvedAt;
    return d ? dayKey(new Date(d), tz).slice(0, 4) : null;
  };
  const years = [...new Set(all.map(yearOf).filter((y): y is string => !!y))].sort().reverse();
  const matches = (p: PayoutRowDTO) =>
    (!filters.accounts.length || filters.accounts.includes(p.accountId)) &&
    (!filters.firms.length || (p.firmId !== null && filters.firms.includes(p.firmId))) &&
    (!filters.statuses.length || filters.statuses.includes(p.status)) &&
    (!filters.year || yearOf(p) === filters.year);
  const filtered = all.filter(matches);

  const missing = new Set<string>();
  const conv = (amount: number | null, from: string) => {
    if (amount === null) return null;
    const c = convertAmount(amount, from, ccy, fx);
    if (c === null) missing.add(from.toUpperCase());
    return c;
  };
  const items: PayoutStatItem[] = filtered.map((p) => ({
    id: p.id,
    status: p.status,
    received: conv(p.amountReceived, p.currency),
    requested: conv(p.amountRequested, p.accountCurrency),
    paidAt: p.paidAt ? new Date(p.paidAt) : null,
    requestedAt: p.requestedAt ? new Date(p.requestedAt) : null,
    firmKey: p.firmId ?? "__none__",
    firmName: p.firmName ?? "No prop firm",
  }));
  const stats = computePayoutStats(items, { timezone: tz, now });

  // Payout ROI on fees: received ÷ net fees for the accounts in scope (all-time; not narrowed by year/status).
  const scoped = accounts.filter(
    (a) => (!filters.accounts.length || filters.accounts.includes(a.id)) && (!filters.firms.length || (a.firm && filters.firms.includes(a.firm.id))),
  );
  const feeTotal = sumConverted(scoped.flatMap((a) => a.economics.feeItems.map((f) => ({ amount: subMoney(f.amount, f.refunded), currency: f.currency }))), ccy, fx);
  const paidTotal = sumConverted(scoped.flatMap((a) => a.economics.payoutItems.filter((p) => p.status === "PAID").map((p) => ({ amount: p.amountReceived ?? 0, currency: p.currency }))), ccy, fx);
  [...feeTotal.missing, ...paidTotal.missing].forEach((m) => missing.add(m));

  // Accounts eligible for a payout right now (funded, rule engine says eligible, no open request).
  const openRequest = new Set(all.filter((p) => p.status === "PENDING" || p.status === "REQUESTED" || p.status === "APPROVED").map((p) => p.accountId));
  const eligible = accounts
    .filter((a) => FUNDED_STATUSES.includes(a.status) && a.payout.eligible)
    .map((a) => ({
      id: a.id,
      name: a.name,
      firmName: a.firm?.name ?? null,
      currency: a.currency,
      eligibleProfit: a.payout.eligibleProfit,
      estimatedShare: a.payout.estimatedTraderShare,
      threshold: a.payout.threshold,
      daysSinceLastPayout: a.payout.daysSinceLastPayout,
      hasOpenRequest: openRequest.has(a.id),
    }));

  // Account options for the dialog: funded-type accounts first, then the rest.
  const splitByAccount = new Map(
    (await prisma.accountRule.findMany({ where: { account: { userId } }, select: { accountId: true, profitSplitPct: true } })).map((r) => [r.accountId, numOrNull(r.profitSplitPct)]),
  );
  const rank = (s: AccountStatus) => (FUNDED_STATUSES.includes(s) ? 0 : s === "PASSED" || s === "CHALLENGE" ? 1 : 2);
  const accountOptions = [...accounts]
    .sort((a, b) => rank(a.status) - rank(b.status) || a.name.localeCompare(b.name))
    .map((a) => ({
      id: a.id,
      name: a.name,
      firmName: a.firm?.name ?? null,
      status: a.status,
      funded: FUNDED_STATUSES.includes(a.status) || a.accountType === "FUNDED" || a.accountType === "INSTANT_FUNDED",
      currency: a.currency,
      profitSplitPct: splitByAccount.get(a.id) ?? null,
      eligibleProfit: a.payout.eligibleProfit,
    }));

  const firmOptions = [...new Map(accounts.filter((a) => a.firm).map((a) => [a.firm!.id, { id: a.firm!.id, name: a.firm!.name }])).values()].sort((a, b) => a.name.localeCompare(b.name));
  const methods = [...new Set(all.map((p) => p.paymentMethod).filter((m): m is string => !!m))].sort();

  return {
    prefs: { currency: ccy, timezone: tz },
    rows: filtered,
    totalRows: all.length,
    stats,
    roi: { fees: feeTotal.total, received: paidTotal.total, multiple: calculatePayoutROI(paidTotal.total, feeTotal.total) },
    eligible,
    accountOptions,
    firmOptions,
    years,
    methods,
    missingCurrencies: [...missing],
    filtered: filters.accounts.length + filters.firms.length + filters.statuses.length + (filters.year ? 1 : 0) > 0,
  };
}
export type PayoutsPageData = Awaited<ReturnType<typeof getPayoutsPage>>;
