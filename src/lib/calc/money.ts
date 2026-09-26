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

const SCALE = 10 ** MONEY_DP;

/**
 * Scaled-integer units (1 unit = 10^-4). toPrecision(15) strips binary noise first, so
 * 1.00005 → 10000.5 → 10001 (half away from zero) rather than 10000.4999… → 10000.
 */
function toUnits(v: number): number {
  const scaled = Number((Math.abs(v) * SCALE).toPrecision(15));
  return Math.sign(v) * Math.round(scaled);
}

/** Round half away from zero to `dp` decimals (default storage precision). */
export function roundMoney(value: Numeric, dp = MONEY_DP): number {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new RangeError(`Non-finite number: ${value}`);
    const f = 10 ** dp;
    const r = Math.sign(value) * Math.round(Number((Math.abs(value) * f).toPrecision(15))) / f;
    return r === 0 ? 0 : r;
  }
  return D(value).toDecimalPlaces(dp, Decimal.ROUND_HALF_UP).toNumber();
}

/**
 * Exact sum of money values. Numbers are summed as scaled integers (exact for values at
 * storage precision, which all stored money is); other numerics go through decimal.js.
 */
export function sumMoney(values: Iterable<Numeric | null | undefined>): number {
  let units = 0;
  let dec: Decimal | null = null;
  for (const v of values) {
    if (v === null || v === undefined) continue;
    if (typeof v === "number") {
      if (!Number.isFinite(v)) throw new RangeError(`Non-finite number: ${v}`);
      units += toUnits(v);
    } else dec = (dec ?? new Decimal(0)).plus(D(v));
  }
  const total = units / SCALE;
  return dec ? roundMoney(dec.plus(total)) : roundMoney(total);
}

export function addMoney(...values: Numeric[]): number {
  return sumMoney(values);
}

export function subMoney(a: Numeric, b: Numeric): number {
  if (typeof a === "number" && typeof b === "number") return (toUnits(a) - toUnits(b)) / SCALE;
  return roundMoney(D(a).minus(D(b)));
}

export function mulMoney(a: Numeric, ...factors: Numeric[]): number {
  let r = D(a);
  for (const f of factors) r = r.times(D(f));
  return roundMoney(r);
}

/** a / b, or null when b is zero. Not rounded — use for ratios. */
export function safeDiv(a: Numeric, b: Numeric): number | null {
  const x = typeof a === "number" ? a : D(a).toNumber();
  const y = typeof b === "number" ? b : D(b).toNumber();
  if (y === 0) return null;
  return x / y;
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

/** Running money accumulator on scaled integers (for replaying long ledgers). */
export class MoneyAccumulator {
  private units: number;
  constructor(initial = 0) {
    this.units = toUnits(initial);
  }
  add(v: number) {
    this.units += toUnits(v);
    return this;
  }
  sub(v: number) {
    this.units -= toUnits(v);
    return this;
  }
  get value() {
    return this.units / SCALE;
  }
}

/** Round a ratio to 6 significant decimals to strip float noise without losing meaning. */
export function roundRatio(value: number, dp = 6): number {
  if (!Number.isFinite(value)) return value;
  return Number(value.toFixed(dp));
}

export function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return roundRatio(sumMoney(values) / values.length);
}

export function isZeroMoney(value: number, tolerance = 0): boolean {
  return Math.abs(value) <= tolerance + 1e-9;
}
