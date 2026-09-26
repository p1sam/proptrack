import { D, roundMoney } from "./money";

/**
 * Currency conversion using user-maintained rates (no live feed). A rate row means
 * 1 base = rate quote; the inverse is derived when only the opposite pair exists.
 * Conversion returns null when no rate is known so callers can exclude and disclose,
 * instead of silently summing different currencies.
 */

export interface FxRate {
  base: string;
  quote: string;
  rate: number;
}

export type FxTable = Map<string, number>;

export function buildFxTable(rates: FxRate[]): FxTable {
  const table: FxTable = new Map();
  for (const r of rates) {
    if (!(r.rate > 0)) continue;
    const base = r.base.toUpperCase();
    const quote = r.quote.toUpperCase();
    table.set(`${base}/${quote}`, r.rate);
    if (!table.has(`${quote}/${base}`)) table.set(`${quote}/${base}`, D(1).div(r.rate).toNumber());
  }
  return table;
}

export function getRate(table: FxTable, from: string, to: string): number | null {
  const f = from.toUpperCase();
  const t = to.toUpperCase();
  if (f === t) return 1;
  return table.get(`${f}/${t}`) ?? null;
}

export function convertAmount(amount: number, from: string, to: string, table: FxTable): number | null {
  const rate = getRate(table, from, to);
  return rate === null ? null : roundMoney(D(amount).times(rate));
}

/** Sum amounts in mixed currencies into `target`; reports currencies that could not be converted. */
export function sumConverted(
  items: { amount: number; currency: string }[],
  target: string,
  table: FxTable,
): { total: number; missing: string[] } {
  let total = D(0);
  const missing = new Set<string>();
  for (const item of items) {
    const c = convertAmount(item.amount, item.currency, target, table);
    if (c === null) missing.add(item.currency.toUpperCase());
    else total = total.plus(c);
  }
  return { total: roundMoney(total), missing: [...missing] };
}
