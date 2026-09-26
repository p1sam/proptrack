import { percentOf, roundRatio, safeDiv, subMoney, sumMoney } from "./money";

/**
 * Prop-firm economics: what trading prop accounts actually cost and returned in cash.
 * Account size and trading P&L are NOT cash — only fees paid and payouts received are.
 *   net cash flow = payouts received − (fees − refunds)
 *   account ROI   = net cash flow / net fees × 100
 *   payout ROI    = payouts received / net fees (a multiple, e.g. 3.5×)
 */

export interface FeeItem {
  amount: number;
  refunded?: number;
}

export interface PayoutItem {
  status: string;
  amountReceived?: number | null;
}

export function netFees(fees: FeeItem[]): number {
  return subMoney(sumMoney(fees.map((f) => f.amount)), sumMoney(fees.map((f) => f.refunded ?? 0)));
}

/** Only payouts marked PAID count as received cash. */
export function payoutsReceived(payouts: PayoutItem[]): number {
  return sumMoney(payouts.filter((p) => p.status === "PAID").map((p) => p.amountReceived ?? 0));
}

export function calculateNetCashFlow(totalPayouts: number, totalFees: number): number {
  return subMoney(totalPayouts, totalFees);
}

export function calculateAccountROI(totalPayouts: number, totalFees: number): number | null {
  if (totalFees <= 0) return null;
  return percentOf(calculateNetCashFlow(totalPayouts, totalFees), totalFees);
}

export function calculatePayoutROI(totalPayouts: number, totalFees: number): number | null {
  if (totalFees <= 0) return null;
  const r = safeDiv(totalPayouts, totalFees);
  return r === null ? null : roundRatio(r, 4);
}

export interface AccountEconomics {
  fees: number;
  payouts: number;
  netCashFlow: number;
  roiPct: number | null;
  payoutMultiple: number | null;
}

export function computeAccountEconomics(fees: FeeItem[], payouts: PayoutItem[]): AccountEconomics {
  const f = netFees(fees);
  const p = payoutsReceived(payouts);
  return {
    fees: f,
    payouts: p,
    netCashFlow: calculateNetCashFlow(p, f),
    roiPct: calculateAccountROI(p, f),
    payoutMultiple: calculatePayoutROI(p, f),
  };
}

/** Challenge pass rate over resolved evaluations (passed / (passed + failed)). */
export function calculatePassRate(passed: number, failed: number): number | null {
  return percentOf(passed, passed + failed);
}
