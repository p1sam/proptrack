import { sumMoney } from "./money";
import { addDaysToKey, weekdayOfKey } from "./time";

/**
 * Calendar helpers: month keys (YYYY-MM), month bounds and per-week totals laid out exactly like
 * the Monday-first month grid (one row per grid week, clipped to the month).
 */

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;
const DAY_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export function isMonthKey(value: string | null | undefined): value is string {
  return !!value && MONTH_RE.test(value);
}

export function isDayKey(value: string | null | undefined): value is string {
  if (!value || !DAY_RE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  return d <= daysInMonth(`${y}-${String(m).padStart(2, "0")}`);
}

export function daysInMonth(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function monthBounds(month: string): { from: string; to: string } {
  return { from: `${month}-01`, to: `${month}-${String(daysInMonth(month)).padStart(2, "0")}` };
}

export function yearMonths(year: number): string[] {
  return Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);
}

export interface WeekTotal {
  /** First and last day of the grid row that fall inside the month. */
  start: string;
  end: string;
  pnl: number;
  trades: number;
  tradingDays: number;
  winningDays: number;
  losingDays: number;
}

/** Totals per Monday-first grid row of `month`. Days outside the month are ignored. */
export function monthWeeks(month: string, days: { day: string; pnl: number; trades: number }[]): WeekTotal[] {
  const { from, to } = monthBounds(month);
  const byDay = new Map(days.filter((d) => d.day >= from && d.day <= to).map((d) => [d.day, d]));
  const weeks: WeekTotal[] = [];
  let start = from;
  while (start <= to) {
    const toSunday = (7 - weekdayOfKey(start)) % 7; // days until Sunday (0 when start is Sunday)
    let end = addDaysToKey(start, toSunday);
    if (end > to) end = to;
    const list: { pnl: number; trades: number }[] = [];
    for (let k = start; k <= end; k = addDaysToKey(k, 1)) {
      const d = byDay.get(k);
      if (d) list.push(d);
    }
    weeks.push({
      start,
      end,
      pnl: sumMoney(list.map((d) => d.pnl)),
      trades: list.reduce((a, d) => a + d.trades, 0),
      tradingDays: list.length,
      winningDays: list.filter((d) => d.pnl > 0).length,
      losingDays: list.filter((d) => d.pnl < 0).length,
    });
    start = addDaysToKey(end, 1);
  }
  return weeks;
}
