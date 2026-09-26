import { D, mean, pctAmount, roundMoney, subMoney, sumMoney } from "./money";
import { dayKey } from "./time";

/**
 * Payout workflow helpers: amount suggestions, form/actions validation, the account events a
 * payout implies, and payout statistics. Pure — the caller converts currencies first.
 *
 * Status ladder: PENDING (drafted, not yet sent) → REQUESTED → APPROVED → PAID; REJECTED ends a
 * request. Only PAID counts as cash received (see economics.ts).
 */

export type PayoutStatusKey = "PENDING" | "REQUESTED" | "APPROVED" | "PAID" | "REJECTED";
export const PAYOUT_STATUSES: PayoutStatusKey[] = ["PENDING", "REQUESTED", "APPROVED", "PAID", "REJECTED"];

/** Statuses whose requested amount is still on its way to the trader. */
export const OPEN_PAYOUT_STATUSES: PayoutStatusKey[] = ["PENDING", "REQUESTED", "APPROVED"];

/** Suggested net received = requested × split − fees, never below zero. */
export function suggestAmountReceived(requested: number | null, splitPct: number | null, fees: number | null): number | null {
  if (requested === null || !(requested > 0)) return null;
  const share = splitPct === null ? requested : pctAmount(requested, splitPct);
  return Math.max(0, subMoney(share, fees ?? 0));
}

export interface PayoutDraft {
  status: PayoutStatusKey;
  requestedAt: Date | null;
  approvedAt: Date | null;
  paidAt: Date | null;
  amountRequested: number | null;
  amountReceived: number | null;
  fees?: number | null;
}

export interface PayoutIssue {
  field: "status" | "requestedAt" | "approvedAt" | "paidAt" | "amountRequested" | "amountReceived" | "fees";
  level: "error" | "warning";
  message: string;
}

/**
 * Validation shared by the form (live feedback) and the action (errors reject the write).
 * Errors: PAID without payment date/amount received, dates out of order, APPROVED without any date.
 * Warnings: received above requested, dates in the future.
 */
export function payoutIssues(p: PayoutDraft, now = new Date()): PayoutIssue[] {
  const out: PayoutIssue[] = [];
  if (p.status === "PAID") {
    if (!p.paidAt) out.push({ field: "paidAt", level: "error", message: "A paid payout needs a payment date." });
    if (p.amountReceived === null) out.push({ field: "amountReceived", level: "error", message: "A paid payout needs the amount received." });
  }
  if (p.status === "APPROVED" && !p.approvedAt) out.push({ field: "approvedAt", level: "error", message: "An approved payout needs an approval date." });
  if ((p.status === "REQUESTED" || p.status === "REJECTED") && !p.requestedAt && !p.approvedAt && !p.paidAt)
    out.push({ field: "requestedAt", level: "error", message: "Add the date the payout was requested." });
  if (p.requestedAt && p.approvedAt && p.approvedAt < p.requestedAt) out.push({ field: "approvedAt", level: "error", message: "Approval date is before the request date." });
  if (p.paidAt && p.approvedAt && p.paidAt < p.approvedAt) out.push({ field: "paidAt", level: "error", message: "Payment date is before the approval date." });
  else if (p.paidAt && p.requestedAt && p.paidAt < p.requestedAt) out.push({ field: "paidAt", level: "error", message: "Payment date is before the request date." });
  if (p.amountReceived !== null && p.amountRequested !== null && p.amountReceived > p.amountRequested)
    out.push({ field: "amountReceived", level: "warning", message: "Amount received is higher than the amount requested — double-check both figures." });
  const future = (d: Date | null) => d !== null && d.getTime() > now.getTime() + 60_000;
  if (future(p.requestedAt) || future(p.approvedAt) || future(p.paidAt)) out.push({ field: "status", level: "warning", message: "One of the dates is in the future." });
  return out;
}

// ─── Account events implied by a payout ─────────────────────────────────────

export type PayoutEventType = "PAYOUT_REQUESTED" | "PAYOUT_APPROVED" | "PAYOUT_RECEIVED" | "PAYOUT_REJECTED";

export interface PayoutEventSpec {
  type: PayoutEventType;
  occurredAt: Date;
  amount: number | null;
}

/**
 * The timeline events a payout's current state implies. Events without a stored date on the
 * payout (a rejection has no date column) keep the date of an existing event of that type, or
 * fall back to `now`.
 */
export function payoutEventSpecs(
  p: { status: PayoutStatusKey; requestedAt: Date | null; approvedAt: Date | null; paidAt: Date | null; amountRequested: number; amountReceived: number | null },
  opts: { now: Date; existing?: Partial<Record<PayoutEventType, Date>> },
): PayoutEventSpec[] {
  if (p.status === "PENDING") return [];
  const ex = opts.existing ?? {};
  const out: PayoutEventSpec[] = [];
  const requestAt = p.requestedAt ?? p.approvedAt ?? p.paidAt ?? ex.PAYOUT_REQUESTED ?? opts.now;
  out.push({ type: "PAYOUT_REQUESTED", occurredAt: requestAt, amount: p.amountRequested });
  if (p.approvedAt && (p.status === "APPROVED" || p.status === "PAID" || p.status === "REJECTED")) {
    out.push({ type: "PAYOUT_APPROVED", occurredAt: p.approvedAt, amount: p.amountRequested });
  }
  if (p.status === "PAID") out.push({ type: "PAYOUT_RECEIVED", occurredAt: p.paidAt ?? ex.PAYOUT_RECEIVED ?? opts.now, amount: p.amountReceived });
  if (p.status === "REJECTED") {
    const at = ex.PAYOUT_REJECTED ?? opts.now;
    out.push({ type: "PAYOUT_REJECTED", occurredAt: at < requestAt ? requestAt : at, amount: p.amountRequested });
  }
  return out;
}

/** Whether recording this payout as PAID should move the account to PAYOUT_RECEIVED. */
export function shouldMarkAccountReceived(prevPayoutStatus: PayoutStatusKey | null, nextPayoutStatus: PayoutStatusKey, accountStatus: string): boolean {
  return nextPayoutStatus === "PAID" && prevPayoutStatus !== "PAID" && (accountStatus === "FUNDED" || accountStatus === "PAYOUT_ELIGIBLE");
}

// ─── Statistics ─────────────────────────────────────────────────────────────

export interface PayoutStatItem {
  id: string;
  status: PayoutStatusKey;
  /** Already converted to the reporting currency; null when no FX rate exists (excluded). */
  received: number | null;
  requested: number | null;
  paidAt: Date | null;
  requestedAt: Date | null;
  firmKey: string;
  firmName: string;
}

export interface PayoutStats {
  totalReceived: number;
  thisMonth: number;
  thisYear: number;
  paidCount: number;
  average: number | null;
  largest: number | null;
  pendingAmount: number;
  pendingCount: number;
  rejectedCount: number;
  byFirm: { key: string; name: string; received: number; count: number; pending: number }[];
  monthly: { month: string; received: number; count: number; cumulative: number }[];
}

/** Received-cash statistics. Months/years are bucketed by payment date in `timezone`. */
export function computePayoutStats(items: PayoutStatItem[], opts: { timezone: string; now: Date }): PayoutStats {
  const today = dayKey(opts.now, opts.timezone);
  const paid = items.filter((p) => p.status === "PAID" && p.received !== null && p.paidAt);
  const month = (d: Date) => dayKey(d, opts.timezone).slice(0, 7);
  const amounts = paid.map((p) => p.received!);
  const open = items.filter((p) => OPEN_PAYOUT_STATUSES.includes(p.status) && p.requested !== null);

  const firms = new Map<string, { key: string; name: string; received: number[]; pending: number[]; count: number }>();
  const firm = (p: PayoutStatItem) => {
    let f = firms.get(p.firmKey);
    if (!f) firms.set(p.firmKey, (f = { key: p.firmKey, name: p.firmName, received: [], pending: [], count: 0 }));
    return f;
  };
  for (const p of paid) {
    const f = firm(p);
    f.received.push(p.received!);
    f.count++;
  }
  for (const p of open) firm(p).pending.push(p.requested!);

  const byMonth = new Map<string, { received: number[]; count: number }>();
  for (const p of paid) {
    const k = month(p.paidAt!);
    const m = byMonth.get(k) ?? { received: [], count: 0 };
    m.received.push(p.received!);
    m.count++;
    byMonth.set(k, m);
  }
  const monthKeys = [...byMonth.keys()].sort();
  const monthly: PayoutStats["monthly"] = [];
  if (monthKeys.length) {
    // Continuous months so gaps show as zero bars rather than being skipped.
    let [y, m] = monthKeys[0].split("-").map(Number);
    const [ly, lm] = monthKeys.at(-1)!.split("-").map(Number);
    let cum = D(0);
    while (y < ly || (y === ly && m <= lm)) {
      const k = `${y}-${String(m).padStart(2, "0")}`;
      const e = byMonth.get(k);
      const received = e ? sumMoney(e.received) : 0;
      cum = cum.plus(received);
      monthly.push({ month: k, received, count: e?.count ?? 0, cumulative: roundMoney(cum) });
      m++;
      if (m > 12) {
        m = 1;
        y++;
      }
    }
  }

  return {
    totalReceived: sumMoney(amounts),
    thisMonth: sumMoney(paid.filter((p) => month(p.paidAt!) === today.slice(0, 7)).map((p) => p.received!)),
    thisYear: sumMoney(paid.filter((p) => month(p.paidAt!).slice(0, 4) === today.slice(0, 4)).map((p) => p.received!)),
    paidCount: paid.length,
    average: amounts.length ? roundMoney(mean(amounts)!) : null,
    largest: amounts.length ? Math.max(...amounts) : null,
    pendingAmount: sumMoney(open.map((p) => p.requested!)),
    pendingCount: open.length,
    rejectedCount: items.filter((p) => p.status === "REJECTED").length,
    byFirm: [...firms.values()]
      .map((f) => ({ key: f.key, name: f.name, received: sumMoney(f.received), count: f.count, pending: sumMoney(f.pending) }))
      .sort((a, b) => b.received - a.received),
    monthly,
  };
}
