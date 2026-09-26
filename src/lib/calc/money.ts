import Decimal from "decimal.js";

/**
 * Money helpers. All sums and products that produce money go through decimal.js so that
 * results such as 0.1 + 0.2 or (1.0875 − 1.085) × 100000 are exact, then are returned as
 * JS numbers rounded to MONEY_DP places (the storage precision). Ratios (win rate, profit
 * factor, R) are plain floats computed from those exact money values.
 */

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export const MONEY_DP = 4;

export type Numeric = number | string | Decimal | { toString(): string };

export function D(value: Numeric | null | undefined): Decimal {
  if (value === null || value === undefined) return new Decimal(0);
  if (value instanceof Decimal) return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new RangeError(`Non-finite number: ${value}`);
    return new Decimal(value);
  }
  return new Decimal(value.toString());
}

/** Round half away from zero to `dp` decimals (default storage precision). */
export function roundMoney(value: Numeric, dp = MONEY_DP): number {
  return D(value).toDecimalPlaces(dp, Decimal.ROUND_HALF_UP).toNumber();
}

export function sumMoney(values: Iterable<Numeric | null | undefined>): number {
  let total = new Decimal(0);
  for (const v of values) {
    if (v === null || v === undefined) continue;
    total = total.plus(D(v));
  }
  return roundMoney(total);
}

export function addMoney(...values: Numeric[]): number {
  return sumMoney(values);
}

export function subMoney(a: Numeric, b: Numeric): number {
  return roundMoney(D(a).minus(D(b)));
}

export function mulMoney(a: Numeric, ...factors: Numeric[]): number {
  let r = D(a);
  for (const f of factors) r = r.times(D(f));
  return roundMoney(r);
}

/** a / b, or null when b is zero. Not rounded — use for ratios. */
export function safeDiv(a: Numeric, b: Numeric): number | null {
  const den = D(b);
  if (den.isZero()) return null;
  return D(a).div(den).toNumber();
}

/** (part / whole) × 100, or null when whole is zero. */
export function percentOf(part: Numeric, whole: Numeric): number | null {
  const r = safeDiv(part, whole);
  return r === null ? null : roundRatio(r * 100);
}

/** pct% of amount, rounded to money precision. */
export function pctAmount(amount: Numeric, pct: Numeric): number {
  return roundMoney(D(amount).times(D(pct)).div(100));
}

/** Round a ratio to 6 significant decimals to strip float noise without losing meaning. */
export function roundRatio(value: number, dp = 6): number {
  if (!Number.isFinite(value)) return value;
  return Number(value.toFixed(dp));
}

export function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return roundRatio(D(sumMoney(values)).div(values.length).toNumber());
}

export function isZeroMoney(value: number, tolerance = 0): boolean {
  return Math.abs(value) <= tolerance + 1e-9;
}
