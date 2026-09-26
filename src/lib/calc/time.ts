/**
 * Timezone-aware calendar helpers built on Intl (no DST tables to maintain).
 */

const partsCache = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = partsCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      weekday: "short",
    });
    partsCache.set(timeZone, f);
  }
  return f;
}

export interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  /** 0 = Sunday … 6 = Saturday */
  weekday: number;
}

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function zonedParts(date: Date, timeZone: string): ZonedParts {
  const parts = formatter(timeZone).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "0";
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    second: Number(get("second")),
    weekday: WEEKDAYS[get("weekday")] ?? 0,
  };
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Trading-day key. With resetHour > 0 the day rolls at that local hour and is labelled by the
 * date it ends on (CME convention: 18:00 ET Monday belongs to Tuesday's session). Uses local
 * wall-clock hours, so DST transitions are handled exactly.
 */
export function dayKey(date: Date, timeZone: string, resetHour = 0): string {
  const p = zonedParts(date, timeZone);
  const key = `${p.year}-${pad(p.month)}-${pad(p.day)}`;
  return resetHour > 0 && p.hour >= resetHour ? addDaysToKey(key, 1) : key;
}

/** Minutes after local midnight in `timeZone`. */
export function minuteOfDay(date: Date, timeZone: string): number {
  const p = zonedParts(date, timeZone);
  return p.hour * 60 + p.minute;
}

/** True when `minute` falls in [start, end), wrapping midnight when end < start. */
export function inMinuteWindow(minute: number, start: number, end: number): boolean {
  if (start === end) return true;
  return start < end ? minute >= start && minute < end : minute >= start || minute < end;
}

/** Weekday (0–6) of a YYYY-MM-DD key. */
export function weekdayOfKey(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function addDaysToKey(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

export function monthKey(key: string): string {
  return key.slice(0, 7);
}

/** Whole days between two YYYY-MM-DD keys (b − a). */
export function daysBetweenKeys(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}

/** True when the half-open interval [open, close] contains a Saturday in `timeZone`. */
export function spansWeekend(openedAt: Date, closedAt: Date, timeZone: string): boolean {
  const start = dayKey(openedAt, timeZone);
  const end = dayKey(closedAt, timeZone);
  const span = daysBetweenKeys(start, end);
  if (span <= 0) return false;
  for (let i = 0; i <= span; i++) {
    const wd = weekdayOfKey(addDaysToKey(start, i));
    if (wd === 6) return true;
  }
  return false;
}

export const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function formatMinute(minute: number): string {
  const m = ((minute % 1440) + 1440) % 1440;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

export function parseHHMM(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}
