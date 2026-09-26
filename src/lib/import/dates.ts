import { isValidTimeZone, zonedParts } from "@/lib/calc/time";

/**
 * Date/time parsing for imported files. Timestamps without an explicit offset are wall-clock
 * times in the file's timezone and are converted to UTC here (DST-aware via Intl).
 */

export type DateFormat = "auto" | "ymd" | "mdy" | "dmy" | "excel";
export type ResolvedDateFormat = Exclude<DateFormat, "auto">;

export const DATE_FORMAT_LABELS: Record<DateFormat, string> = {
  auto: "Detect automatically",
  ymd: "Year first — 2024-03-15, 2024.03.15 (ISO / MetaTrader)",
  mdy: "Month first — 03/15/2024 (US)",
  dmy: "Day first — 15/03/2024 (EU)",
  excel: "Excel serial number — 45366.5",
};

export interface WallTime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  ms: number;
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

function offsetAt(utcMs: number, timeZone: string): number {
  const d = new Date(Math.floor(utcMs / 1000) * 1000);
  const p = zonedParts(d, timeZone);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - d.getTime();
}

/**
 * Convert a wall-clock time in `timeZone` to a UTC instant.
 * - Ambiguous times (DST fall-back overlap) resolve to the earlier instant.
 * - Non-existent times (spring-forward gap) shift forward by the gap, like Temporal's
 *   "compatible" disambiguation (02:30 → 03:30 on a 1-hour jump).
 */
export function zonedWallTimeToUtc(w: WallTime, timeZone: string): Date {
  const wall = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second, w.ms);
  if (timeZone === "UTC" || timeZone === "Etc/UTC") return new Date(wall);
  const before = offsetAt(wall - 12 * 3600_000, timeZone);
  const after = offsetAt(wall + 12 * 3600_000, timeZone);
  const candidates = [...new Set([before, after])]
    .map((o) => wall - o)
    .filter((t) => offsetAt(t, timeZone) === wall - t)
    .sort((a, b) => a - b);
  if (candidates.length) return new Date(candidates[0]);
  return new Date(wall - before);
}

function validWall(w: WallTime): boolean {
  if (w.month < 1 || w.month > 12 || w.day < 1 || w.day > 31) return false;
  if (w.hour > 24 || w.minute > 59 || w.second > 60) return false;
  if (w.hour === 24 && (w.minute || w.second)) return false;
  const probe = new Date(Date.UTC(w.year, w.month - 1, w.day));
  return probe.getUTCMonth() === w.month - 1 && probe.getUTCDate() === w.day && w.year >= 1970 && w.year <= 2100;
}

export interface TimeOfDay {
  hour: number;
  minute: number;
  second: number;
  ms: number;
}

/** "14:30", "14:30:05", "14:30:05.123", "2:30 PM", "02:30:00 pm". */
export function parseTimeOfDay(raw: string): TimeOfDay | null {
  const m = /^(\d{1,2})[:.](\d{2})(?:[:.](\d{2})(?:[.,](\d{1,6}))?)?\s*([ap])?\.?m?\.?$/i.exec(raw.trim());
  if (!m) return null;
  let hour = Number(m[1]);
  const minute = Number(m[2]);
  const second = m[3] ? Number(m[3]) : 0;
  const ms = m[4] ? Math.round(Number(`0.${m[4]}`) * 1000) : 0;
  const ampm = m[5]?.toLowerCase();
  if (ampm) {
    if (hour < 1 || hour > 12) return null;
    if (ampm === "p" && hour < 12) hour += 12;
    if (ampm === "a" && hour === 12) hour = 0;
  }
  if (hour > 23 || minute > 59 || second > 59) return null;
  return { hour, minute, second, ms };
}

interface DateTokens {
  kind: "numeric" | "named";
  a: number;
  b: number;
  c: number;
  /** Which token holds the 4-digit year for numeric dates ("first" or "last"). */
  yearPos: "first" | "last";
  rest: string;
}

function tokenizeDate(raw: string): DateTokens | null {
  const s = raw.trim();
  let m = /^(\d{4})[-./](\d{1,2})[-./](\d{1,2})(?:[T\s]+(.*))?$/i.exec(s);
  if (m) return { kind: "numeric", a: Number(m[1]), b: Number(m[2]), c: Number(m[3]), yearPos: "first", rest: m[4] ?? "" };
  m = /^(\d{1,2})[-./](\d{1,2})[-./](\d{2}|\d{4})(?:[T\s,]+(.*))?$/i.exec(s);
  if (m) {
    const y = Number(m[3]);
    return { kind: "numeric", a: Number(m[1]), b: Number(m[2]), c: m[3].length === 2 ? 2000 + y : y, yearPos: "last", rest: m[4] ?? "" };
  }
  // 15 Mar 2024 / 15-Mar-2024 [time]
  m = /^(\d{1,2})[\s\-.]([A-Za-z]{3,9})\.?[\s\-.,]+(\d{4})(?:[T\s,]+(.*))?$/.exec(s);
  if (m && MONTHS[m[2].toLowerCase().slice(0, 4)] !== undefined) return named(Number(m[3]), m[2], Number(m[1]), m[4]);
  if (m && MONTHS[m[2].toLowerCase().slice(0, 3)] !== undefined) return named(Number(m[3]), m[2], Number(m[1]), m[4]);
  // Mar 15, 2024 [time]
  m = /^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})(?:[T\s,]+(.*))?$/.exec(s);
  if (m && MONTHS[m[1].toLowerCase().slice(0, 3)] !== undefined) return named(Number(m[3]), m[1], Number(m[2]), m[4]);
  return null;
}

function named(year: number, monthName: string, day: number, rest: string | undefined): DateTokens {
  const key = monthName.toLowerCase();
  const month = MONTHS[key.slice(0, 4)] ?? MONTHS[key.slice(0, 3)];
  return { kind: "named", a: year, b: month, c: day, yearPos: "first", rest: rest ?? "" };
}

const EXCEL_EPOCH = Date.UTC(1899, 11, 30);

function isExcelSerial(raw: string): boolean {
  return /^\d{4,6}(\.\d+)?$/.test(raw.trim()) && Number(raw) > 20000 && Number(raw) < 80000;
}

/** Explicit offset at the end of a time string: Z, +02:00, +0200, UTC, UTC+2, GMT-05:00. */
function splitOffset(rest: string): { time: string; offsetMin: number | null } {
  const s = rest.trim();
  const sign = (sg: string, h: string, mm: string | undefined) => (sg === "-" ? -1 : 1) * (Number(h) * 60 + Number(mm ?? 0));
  let m = /^(.*\d)\s*Z$/i.exec(s);
  if (m) return { time: m[1], offsetMin: 0 };
  m = /^(.*\d)\s*(?:UTC|GMT)?\s*([+-])(\d{2}):?(\d{2})$/i.exec(s);
  if (m && parseTimeOfDay(m[1])) return { time: m[1], offsetMin: sign(m[2], m[3], m[4]) };
  m = /^(.*\d)\s*(?:UTC|GMT)\s*([+-])(\d{1,2})(?::?(\d{2}))?$/i.exec(s);
  if (m) return { time: m[1], offsetMin: sign(m[2], m[3], m[4]) };
  m = /^(.*\d)\s*(?:UTC|GMT)$/i.exec(s);
  if (m) return { time: m[1], offsetMin: 0 };
  return { time: s, offsetMin: null };
}

export interface ParsedDate {
  date: Date;
  /** True when the cell only had a date (no time of day). */
  dateOnly: boolean;
}

export type DateParseResult = { ok: true; value: ParsedDate } | { ok: false; error: string };

/**
 * Parse a date or date-time cell (optionally with a separate time cell) into a UTC instant.
 * `format` must be resolved (see detectDateFormat) — "auto" is treated as "ymd" then falls
 * back to unambiguous day/month ordering.
 */
export function parseDateTime(raw: string, opts: { format: DateFormat; timeZone: string; timeRaw?: string | null }): DateParseResult {
  const cell = raw.trim();
  if (!cell) return { ok: false, error: "Missing date" };

  let wall: WallTime | null = null;
  let offsetMin: number | null = null;
  let dateOnly = true;

  if (opts.format === "excel" || (opts.format === "auto" && isExcelSerial(cell))) {
    if (!isExcelSerial(cell)) return { ok: false, error: `"${cell}" is not an Excel date number` };
    const ms = Math.round(Number(cell) * 86_400_000) + EXCEL_EPOCH;
    const d = new Date(ms);
    wall = { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(), hour: d.getUTCHours(), minute: d.getUTCMinutes(), second: d.getUTCSeconds(), ms: d.getUTCMilliseconds() };
    dateOnly = Number(cell) % 1 === 0;
  } else {
    const tok = tokenizeDate(cell);
    if (!tok) return { ok: false, error: `Unrecognised date "${cell}"` };
    let year: number, month: number, day: number;
    if (tok.kind === "named" || tok.yearPos === "first") {
      [year, month, day] = [tok.a, tok.b, tok.c];
    } else {
      year = tok.c;
      let order: "mdy" | "dmy";
      if (opts.format === "mdy" || opts.format === "dmy") order = opts.format;
      else if (tok.a > 12) order = "dmy";
      else if (tok.b > 12) order = "mdy";
      else return { ok: false, error: `Ambiguous date "${cell}" — choose day-first or month-first` };
      [month, day] = order === "mdy" ? [tok.a, tok.b] : [tok.b, tok.a];
    }
    let time: TimeOfDay = { hour: 0, minute: 0, second: 0, ms: 0 };
    if (tok.rest) {
      const split = splitOffset(tok.rest);
      const t = parseTimeOfDay(split.time);
      if (!t) return { ok: false, error: `Unrecognised time "${tok.rest}"` };
      time = t;
      offsetMin = split.offsetMin;
      dateOnly = false;
    }
    wall = { year, month, day, ...time };
  }

  if (opts.timeRaw != null && opts.timeRaw.trim() !== "") {
    const split = splitOffset(opts.timeRaw);
    const t = parseTimeOfDay(split.time);
    if (!t) return { ok: false, error: `Unrecognised time "${opts.timeRaw.trim()}"` };
    wall = { ...wall, ...t };
    if (split.offsetMin !== null) offsetMin = split.offsetMin;
    dateOnly = false;
  }

  if (!validWall(wall)) return { ok: false, error: `Invalid date "${cell}"` };
  if (wall.hour === 24) wall = { ...wall, hour: 0 };
  let date: Date;
  if (offsetMin !== null) {
    date = new Date(Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second, wall.ms) - offsetMin * 60_000);
  } else {
    if (!isValidTimeZone(opts.timeZone)) return { ok: false, error: `Unknown timezone "${opts.timeZone}"` };
    date = zonedWallTimeToUtc(wall, opts.timeZone);
  }
  return { ok: true, value: { date, dateOnly } };
}

export interface DateFormatDetection {
  format: ResolvedDateFormat;
  /** True when day-first and month-first both fit every sample; the user must choose. */
  ambiguous: boolean;
}

/** Inspect sample date cells to decide the date order. */
export function detectDateFormat(samples: string[]): DateFormatDetection {
  const cells = samples.map((s) => s.trim()).filter(Boolean);
  if (!cells.length) return { format: "ymd", ambiguous: false };
  if (cells.every(isExcelSerial)) return { format: "excel", ambiguous: false };
  let dmy = false;
  let mdy = false;
  let yearLast = 0;
  for (const c of cells) {
    const tok = tokenizeDate(c);
    if (!tok || tok.kind === "named" || tok.yearPos === "first") continue;
    yearLast++;
    if (tok.a > 12) dmy = true;
    if (tok.b > 12) mdy = true;
  }
  if (!yearLast) return { format: "ymd", ambiguous: false };
  if (dmy && !mdy) return { format: "dmy", ambiguous: false };
  if (mdy && !dmy) return { format: "mdy", ambiguous: false };
  // Neither (all ≤ 12) or contradictory: the user decides. Default to day-first.
  return { format: "dmy", ambiguous: true };
}

/** A curated list of IANA zones for the picker; any valid IANA name is also accepted. */
export const COMMON_TIMEZONES: { value: string; label: string }[] = [
  { value: "UTC", label: "UTC" },
  { value: "Europe/London", label: "London (GMT/BST)" },
  { value: "Europe/Berlin", label: "Berlin / Frankfurt (CET/CEST)" },
  { value: "Europe/Athens", label: "Athens (EET/EEST) — typical MetaTrader server time" },
  { value: "Etc/GMT-2", label: "GMT+2 fixed (no DST)" },
  { value: "Etc/GMT-3", label: "GMT+3 fixed (no DST)" },
  { value: "Europe/Moscow", label: "Moscow" },
  { value: "Asia/Dubai", label: "Dubai" },
  { value: "Asia/Kolkata", label: "India" },
  { value: "Asia/Singapore", label: "Singapore" },
  { value: "Asia/Hong_Kong", label: "Hong Kong" },
  { value: "Asia/Tokyo", label: "Tokyo" },
  { value: "Australia/Sydney", label: "Sydney" },
  { value: "America/New_York", label: "New York (ET)" },
  { value: "America/Chicago", label: "Chicago (CT) — CME" },
  { value: "America/Denver", label: "Denver (MT)" },
  { value: "America/Los_Angeles", label: "Los Angeles (PT)" },
  { value: "America/Sao_Paulo", label: "São Paulo" },
  { value: "Africa/Johannesburg", label: "Johannesburg" },
  { value: "Africa/Lagos", label: "Lagos" },
  { value: "Africa/Nairobi", label: "Nairobi" },
];

export { isValidTimeZone };
