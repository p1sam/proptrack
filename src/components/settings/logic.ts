import { buildFxTable, getRate, type FxRate } from "@/lib/calc/fx";
import { inMinuteWindow, zonedParts } from "@/lib/calc/time";

/**
 * Pure helpers for the Settings page (no React, no I/O) so they can be unit-tested.
 */

const DAY = 1440;
const mod = (n: number) => ((n % DAY) + DAY) % DAY;

/** Minutes east of UTC for `timeZone` at `at`. */
export function utcOffsetMinutes(at: Date, timeZone: string): number {
  const p = zonedParts(at, timeZone);
  const wall = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((wall - Math.floor(at.getTime() / 1000) * 1000) / 60_000);
}

/** Shift a minute-of-day from one timezone's wall clock to another's, using offsets at `at`. */
export function shiftMinute(minute: number, fromTz: string, toTz: string, at: Date): number {
  if (fromTz === toTz) return mod(minute);
  return mod(minute + utcOffsetMinutes(at, toTz) - utcOffsetMinutes(at, fromTz));
}

export interface Segment {
  start: number;
  end: number;
}

/** Split a [start, end) window (wrapping midnight when end < start) into non-wrapping segments. */
export function windowSegments(start: number, end: number): Segment[] {
  const s = mod(start);
  const e = mod(end);
  if (s === e) return [{ start: 0, end: DAY }];
  if (s < e) return [{ start: s, end: e }];
  return [
    ...(s < DAY ? [{ start: s, end: DAY }] : []),
    ...(e > 0 ? [{ start: 0, end: e }] : []),
  ];
}

export interface TimelineSession {
  id: string;
  name: string;
  timezone: string;
  startMinute: number;
  endMinute: number;
  priority: number;
  isActive: boolean;
}

export interface WinnerSegment extends Segment {
  /** Session id that a trade opened in this span is assigned to, or null for none. */
  id: string | null;
}

/**
 * Which session wins each minute of the day in `displayTz` — the same rule as assignSession:
 * the active session with the lowest priority number whose window contains the minute.
 */
export function winnerTimeline(sessions: TimelineSession[], displayTz: string, at: Date): WinnerSegment[] {
  const ordered = sessions
    .filter((s) => s.isActive)
    .sort((a, b) => a.priority - b.priority)
    .map((s) => ({ id: s.id, start: shiftMinute(s.startMinute, s.timezone, displayTz, at), end: shiftMinute(s.endMinute, s.timezone, displayTz, at) }));
  const out: WinnerSegment[] = [];
  for (let m = 0; m < DAY; m++) {
    const w = ordered.find((s) => inMinuteWindow(m, s.start, s.end))?.id ?? null;
    const last = out[out.length - 1];
    if (last && last.id === w) last.end = m + 1;
    else out.push({ id: w, start: m, end: m + 1 });
  }
  return out;
}

/** Account currencies that cannot be converted to `target` with the given rates (direct or inverse). */
export function currenciesMissingRate(currencies: string[], target: string, rates: FxRate[]): string[] {
  const table = buildFxTable(rates);
  const unique = [...new Set(currencies.map((c) => c.toUpperCase()))];
  return unique.filter((c) => getRate(table, c, target) === null).sort();
}

/** IANA zones for the picker; Intl omits "UTC" on some runtimes, so it is always included. */
export function timeZoneList(extra: string[] = []): string[] {
  let zones: string[] = [];
  try {
    zones = Intl.supportedValuesOf("timeZone");
  } catch {
    zones = [];
  }
  return [...new Set(["UTC", ...zones, ...extra.filter(Boolean)])].sort((a, b) => (a === "UTC" ? -1 : b === "UTC" ? 1 : a.localeCompare(b)));
}

export function plural(n: number, word: string, pluralWord = `${word}s`) {
  return `${n} ${n === 1 ? word : pluralWord}`;
}

/** Trade classification option lists, in the order the trade form shows them. */
export const CATEGORY_KINDS = [
  { kind: "SETUP", label: "Setups" },
  { kind: "TIMEFRAME", label: "Timeframes" },
  { kind: "TRADE_TYPE", label: "Trade types" },
  { kind: "ENTRY_MODEL", label: "Entry models" },
  { kind: "CONFLUENCE", label: "Confluences" },
  { kind: "MARKET_CONDITION", label: "Market conditions" },
] as const;
export type SettingsCategoryKind = (typeof CATEGORY_KINDS)[number]["kind"];
