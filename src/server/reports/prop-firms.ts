import "server-only";
import type { TradeFilters } from "@/lib/filters";
import { FEE_LABEL, PAYOUT_STATUS_LABEL, STATUS_LABEL, ACCOUNT_TYPE_LABEL } from "@/lib/labels";
import { num, numOrNull } from "@/lib/num";
import type { FeeType, PayoutStatus, AccountStatus, AccountType } from "@/generated/prisma/enums";
import { prisma } from "../db";
import { buildPortfolio, getFxTable, getPrefs, listAccountSummaries } from "../queries/accounts";
import { feesByType, lifecycleCounts, perFirm, portfolioEconomics } from "./aggregations";
import { roundRatio } from "@/lib/calc/money";
import { toCsv, type CsvValue } from "./csv";

const r2 = (v: number | null) => (v === null ? null : roundRatio(v, 2));

/**
 * Prop-firm report: cash economics of every account (fees paid vs payouts received) plus
 * lifecycle outcomes. Account and firm filters apply; date filters do not — the report covers
 * each account's whole life, because a fee paid last year is part of this year's funded account.
 */
export async function buildPropFirmReport(userId: string, filters: Pick<TradeFilters, "accounts" | "firms">) {
  const [prefs, fx, all] = await Promise.all([getPrefs(userId), getFxTable(userId), listAccountSummaries(userId)]);
  const accounts = all.filter(
    (a) => (!filters.accounts.length || filters.accounts.includes(a.id)) && (!filters.firms.length || (a.firm && filters.firms.includes(a.firm.id))),
  );
  const ids = accounts.map((a) => a.id);
  const ccy = prefs.currency;
  const [fees, payouts, purchasedRows] = await Promise.all([
    prisma.accountFee.findMany({ where: { accountId: { in: ids }, account: { userId } }, select: { type: true, amount: true, refunded: true, currency: true } }),
    prisma.payout.findMany({
      where: { userId, accountId: { in: ids } },
      orderBy: [{ paidAt: { sort: "desc", nulls: "last" } }, { requestedAt: "desc" }],
      select: {
        id: true,
        status: true,
        requestedAt: true,
        paidAt: true,
        amountRequested: true,
        amountReceived: true,
        currency: true,
        paymentMethod: true,
        account: { select: { name: true, propFirm: { select: { name: true } } } },
      },
    }),
    prisma.tradingAccount.findMany({
      where: { userId, id: { in: ids }, OR: [{ purchasedAt: { not: null } }, { fees: { some: { type: "CHALLENGE" } } }] },
      select: { id: true },
    }),
  ]);
  const purchased = new Set(purchasedRows.map((r) => r.id));
  const portfolio = buildPortfolio(accounts, ccy, fx);
  const counts = lifecycleCounts(accounts);

  return {
    currency: ccy,
    timezone: prefs.timezone,
    generatedAt: new Date().toISOString(),
    filtered: filters.accounts.length > 0 || filters.firms.length > 0,
    portfolio,
    counts: { ...counts, purchased: purchased.size },
    feesByType: feesByType(
      fees.map((f) => ({ type: f.type, amount: num(f.amount), refunded: num(f.refunded), currency: f.currency })),
      ccy,
      fx,
    ).map((f) => ({ ...f, label: FEE_LABEL[f.type as FeeType] ?? f.type })),
    firms: perFirm(accounts, purchased, ccy, fx),
    accounts: accounts
      .map((a) => {
        const e = portfolioEconomics([a], ccy, fx);
        return {
          id: a.id,
          name: a.name,
          firm: a.firm?.name ?? null,
          type: ACCOUNT_TYPE_LABEL[a.accountType as AccountType] ?? a.accountType,
          status: STATUS_LABEL[a.status as AccountStatus] ?? a.status,
          currency: a.currency,
          accountSize: a.accountSize,
          purchasedAt: a.purchasedAt,
          fees: e.fees,
          payouts: e.payouts,
          netCashFlow: e.netCashFlow,
          tradingPnl: e.tradingPnl,
          missing: e.missing,
        };
      })
      .sort((a, b) => (a.firm ?? "").localeCompare(b.firm ?? "") || a.name.localeCompare(b.name)),
    payouts: payouts.map((p) => ({
      id: p.id,
      account: p.account.name,
      firm: p.account.propFirm?.name ?? null,
      status: PAYOUT_STATUS_LABEL[p.status as PayoutStatus] ?? p.status,
      paid: p.status === "PAID",
      requestedAt: p.requestedAt?.toISOString() ?? null,
      paidAt: p.paidAt?.toISOString() ?? null,
      amountRequested: num(p.amountRequested),
      amountReceived: numOrNull(p.amountReceived),
      currency: p.currency,
      method: p.paymentMethod,
    })),
  };
}
export type PropFirmReport = Awaited<ReturnType<typeof buildPropFirmReport>>;

export const PASS_RATE_DEFINITION =
  "Pass rate = passed ÷ (passed + failed) over evaluation accounts (1-, 2- and 3-step challenges) that are resolved. An evaluation counts as passed when its status is Passed or any funded status; failed and breached count as failed. Challenges still in progress are left out.";

export function propFirmCsv(r: PropFirmReport): string {
  const c = r.currency;
  const p = r.portfolio;
  const blank: CsvValue[] = [];
  const rows: CsvValue[][] = [
    ["Summary", `Value (${c})`],
    ["Accounts", r.counts.total],
    ["Accounts purchased", r.counts.purchased],
    ["Evaluations passed", r.counts.passed],
    ["Evaluations failed or breached", r.counts.failed],
    ["Breached", r.counts.breached],
    ["Funded", r.counts.funded],
    ["Pass rate %", r2(r.counts.passRate)],
    ["Fees paid (net of refunds)", p.totalFees],
    ["Payouts received", p.totalPayouts],
    ["Net cash flow", p.netCashFlow],
    ["ROI on fees %", r2(p.roiPct)],
    ["Payout multiple", p.payoutMultiple],
    ["Missing exchange rates", p.missingCurrencies.join(" ")],
    blank,
    ["Fees by type", `Count`, `Total (${c})`],
    ...r.feesByType.map((f) => [f.label, f.count, f.total]),
    blank,
    ["Firm", "Accounts", "Purchased", "Passed", "Failed", "Funded", "Pass rate %", `Fees (${c})`, `Payouts (${c})`, `Net (${c})`, "ROI on fees %", "Payout multiple"],
    ...r.firms.map((f) => [f.firmName, f.accounts, f.purchased, f.passed, f.failed, f.funded, r2(f.passRate), f.fees, f.payouts, f.netCashFlow, r2(f.roiPct), f.payoutMultiple]),
    blank,
    ["Account", "Firm", "Type", "Status", "Account currency", "Account size", `Fees (${c})`, `Payouts (${c})`, `Net (${c})`, `Trading P&L (${c})`],
    ...r.accounts.map((a) => [a.name, a.firm, a.type, a.status, a.currency, a.accountSize, a.fees, a.payouts, a.netCashFlow, a.tradingPnl]),
    blank,
    ["Payout account", "Firm", "Status", "Requested", "Paid", "Amount requested", "Amount received", "Currency", "Method"],
    ...r.payouts.map((x) => [x.account, x.firm, x.status, x.requestedAt?.slice(0, 10), x.paidAt?.slice(0, 10), x.amountRequested, x.amountReceived, x.currency, x.method]),
    blank,
    ["Definitions"],
    ["Cash view: only fees paid and payouts received (status Paid) are money in or out. Account balances and trading P&L are not cash."],
    [PASS_RATE_DEFINITION],
    [`Amounts are converted to ${c} with your Settings exchange rates; items without a rate are excluded and listed above.`],
  ];
  return toCsv(["PropTrack prop-firm report", `Generated ${r.generatedAt}`], rows);
}
