/**
 * Pure aggregation helpers for reports (no I/O; unit-tested in tests/reports). Money goes
 * through the calc layer (sumMoney / sumConverted / economics) — nothing here sums raw floats.
 */
import type { Emotion } from "@/lib/calc/behavior";
import { EMOTIONS } from "@/lib/calc/behavior";
import { calculateAccountROI, calculateNetCashFlow, calculatePassRate, calculatePayoutROI } from "@/lib/calc/economics";
import { sumConverted, type FxTable } from "@/lib/calc/fx";
import { mean, percentOf, roundRatio, subMoney } from "@/lib/calc/money";
import type { GroupStats } from "@/lib/calc/stats";
import { zonedParts } from "@/lib/calc/time";

const pad = (n: number) => String(n).padStart(2, "0");

// ─── Dates ──────────────────────────────────────────────────────────────────

export function isMonthKey(v: string | null | undefined): v is string {
  if (!v || !/^\d{4}-\d{2}$/.test(v)) return false;
  const m = Number(v.slice(5));
  return m >= 1 && m <= 12;
}

/** First and last YYYY-MM-DD of a YYYY-MM month. */
export function monthBounds(month: string): { from: string; to: string } {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${pad(last)}` };
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}

/** "YYYY-MM-DD HH:mm" wall-clock time in `timeZone` (what the user sees in the app). */
export function zonedStamp(date: Date | null | undefined, timeZone: string): string {
  if (!date) return "";
  const p = zonedParts(date, timeZone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)} ${pad(p.hour)}:${pad(p.minute)}`;
}

/**
 * A Date whose UTC fields equal the wall-clock time in `timeZone`. Spreadsheet dates carry no
 * zone, so writing this makes Excel display the same local time the app shows.
 */
export function zonedWallClock(date: Date, timeZone: string): Date {
  const p = zonedParts(date, timeZone);
  return new Date(Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second));
}

// ─── Psychology ─────────────────────────────────────────────────────────────

interface PsychTrade {
  emotions?: Partial<Record<Emotion, number | null>>;
  followedPlan?: boolean | null;
}

export interface EmotionAverage {
  emotion: Emotion;
  n: number;
  average: number | null;
}

/** Average 1–5 rating per emotion over trades that rated it. */
export function averageEmotions(trades: PsychTrade[]): EmotionAverage[] {
  return EMOTIONS.map((emotion) => {
    const vals = trades.map((t) => t.emotions?.[emotion]).filter((v): v is number => typeof v === "number");
    const avg = mean(vals);
    return { emotion, n: vals.length, average: avg === null ? null : roundRatio(avg, 2) };
  });
}

/** Followed-plan % = trades journaled "followed plan: yes" ÷ trades where the question was answered. */
export function followedPlanRate(trades: PsychTrade[]): { answered: number; followed: number; pct: number | null } {
  const answered = trades.filter((t) => t.followedPlan === true || t.followedPlan === false);
  const followed = answered.filter((t) => t.followedPlan === true).length;
  return { answered: answered.length, followed, pct: percentOf(followed, answered.length) };
}

/**
 * Mistake tags ranked by cost: the net P&L of the trades carrying each mistake tag, most negative
 * first. Profitable mistake tags are kept (they are still mistakes) but sort last.
 */
export function topMistakeTags(tagGroups: GroupStats[], mistakeTagNames: Iterable<string>, limit = 8): GroupStats[] {
  const names = new Set(mistakeTagNames);
  return tagGroups
    .filter((g) => names.has(g.key))
    .sort((a, b) => a.netPnl - b.netPnl)
    .slice(0, limit);
}

// ─── Prop-firm economics ────────────────────────────────────────────────────

export const NON_EVALUATION_TYPES = ["FUNDED", "PERSONAL", "INSTANT_FUNDED"] as const;

export interface EconAccount {
  id: string;
  name: string;
  firm: { id: string; name: string } | null;
  status: string;
  group: "challenge" | "funded" | "passed" | "failed" | "inactive";
  accountType: string;
  currency: string;
  tradingPnl: number;
  economics: {
    fees: number;
    payouts: number;
    netCashFlow: number;
    feeItems: { amount: number; refunded: number; currency: string }[];
    payoutItems: { status: string; amountReceived: number | null; currency: string }[];
  };
}

export interface FeeRow {
  type: string;
  amount: number;
  refunded: number;
  currency: string;
}

export function isEvaluation(accountType: string): boolean {
  return !(NON_EVALUATION_TYPES as readonly string[]).includes(accountType);
}

/**
 * Lifecycle counts. Pass rate = passed ÷ (passed + failed) over evaluation accounts that are
 * resolved; a passed evaluation is one with status PASSED or any funded status. Challenges still
 * in progress are excluded, so the rate isn't diluted by open attempts.
 */
export function lifecycleCounts(accounts: Pick<EconAccount, "status" | "group" | "accountType">[]) {
  const evals = accounts.filter((a) => isEvaluation(a.accountType));
  const passed = evals.filter((a) => a.status === "PASSED" || a.group === "funded").length;
  const failed = evals.filter((a) => a.group === "failed").length;
  return {
    total: accounts.length,
    evaluations: evals.length,
    inProgress: evals.filter((a) => a.group === "challenge").length,
    passed,
    failed,
    breached: accounts.filter((a) => a.status === "BREACHED").length,
    funded: accounts.filter((a) => a.group === "funded").length,
    passRate: calculatePassRate(passed, failed),
  };
}

function convertedEconomics(accounts: EconAccount[], currency: string, fx: FxTable) {
  const missing = new Set<string>();
  const conv = (items: { amount: number; currency: string }[]) => {
    const r = sumConverted(items, currency, fx);
    r.missing.forEach((m) => missing.add(m));
    return r.total;
  };
  const fees = conv(accounts.flatMap((a) => a.economics.feeItems.map((f) => ({ amount: subMoney(f.amount, f.refunded), currency: f.currency }))));
  const payouts = conv(accounts.flatMap((a) => a.economics.payoutItems.filter((p) => p.status === "PAID").map((p) => ({ amount: p.amountReceived ?? 0, currency: p.currency }))));
  const tradingPnl = conv(accounts.map((a) => ({ amount: a.tradingPnl, currency: a.currency })));
  return {
    fees,
    payouts,
    tradingPnl,
    netCashFlow: calculateNetCashFlow(payouts, fees),
    roiPct: calculateAccountROI(payouts, fees),
    payoutMultiple: calculatePayoutROI(payouts, fees),
    missing: [...missing],
  };
}

export interface FirmRow {
  firmId: string | null;
  firmName: string;
  accounts: number;
  purchased: number;
  passed: number;
  failed: number;
  funded: number;
  passRate: number | null;
  fees: number;
  payouts: number;
  netCashFlow: number;
  roiPct: number | null;
  payoutMultiple: number | null;
  missing: string[];
}

/** Per-firm economics in `currency`, sorted by net cash flow (best first). */
export function perFirm(accounts: EconAccount[], purchasedIds: Set<string>, currency: string, fx: FxTable): FirmRow[] {
  const groups = new Map<string, EconAccount[]>();
  for (const a of accounts) {
    const k = a.firm?.id ?? "__none__";
    groups.set(k, [...(groups.get(k) ?? []), a]);
  }
  return [...groups.entries()]
    .map(([key, list]) => {
      const c = lifecycleCounts(list);
      const e = convertedEconomics(list, currency, fx);
      return {
        firmId: key === "__none__" ? null : key,
        firmName: list[0].firm?.name ?? "No firm",
        accounts: list.length,
        purchased: list.filter((a) => purchasedIds.has(a.id)).length,
        passed: c.passed,
        failed: c.failed,
        funded: c.funded,
        passRate: c.passRate,
        fees: e.fees,
        payouts: e.payouts,
        netCashFlow: e.netCashFlow,
        roiPct: e.roiPct,
        payoutMultiple: e.payoutMultiple,
        missing: e.missing,
      };
    })
    .sort((a, b) => b.netCashFlow - a.netCashFlow || a.firmName.localeCompare(b.firmName));
}

/** Net fees (amount − refunded) per fee type, converted to `currency`. */
export function feesByType(fees: FeeRow[], currency: string, fx: FxTable): { type: string; count: number; total: number; missing: string[] }[] {
  const groups = new Map<string, FeeRow[]>();
  for (const f of fees) groups.set(f.type, [...(groups.get(f.type) ?? []), f]);
  return [...groups.entries()]
    .map(([type, list]) => {
      const r = sumConverted(list.map((f) => ({ amount: subMoney(f.amount, f.refunded), currency: f.currency })), currency, fx);
      return { type, count: list.length, total: r.total, missing: r.missing };
    })
    .sort((a, b) => b.total - a.total);
}

export { convertedEconomics as portfolioEconomics };
