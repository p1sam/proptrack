import { zonedParts } from "@/lib/calc/time";

/**
 * Conversions between UTC instants and `<input type="datetime-local">` values ("YYYY-MM-DDTHH:mm")
 * interpreted in an IANA timezone — the user's display timezone, not the browser's.
 */

const pad = (n: number) => String(n).padStart(2, "0");

/** UTC instant → "YYYY-MM-DDTHH:mm" wall-clock time in `timeZone`. */
export function toZonedLocalInput(date: Date | string, timeZone: string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const p = zonedParts(d, timeZone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

const LOCAL_RE = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/;

function offsetAt(ms: number, timeZone: string): number {
  const p = zonedParts(new Date(ms), timeZone);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - ms;
}

/**
 * Wall-clock "YYYY-MM-DDTHH:mm[:ss]" in `timeZone` → UTC Date, or null for malformed input.
 * - Ambiguous times (clocks going back) resolve to the earlier instant.
 * - Non-existent times (clocks going forward) resolve by shifting forward by the gap, the same
 *   way browsers and Temporal ("compatible") do: 02:30 on a spring-forward night → 03:30.
 */
export function fromZonedLocalInput(value: string, timeZone: string): Date | null {
  const m = LOCAL_RE.exec(value.trim());
  if (!m) return null;
  const [y, mo, d, h, mi, s] = [m[1], m[2], m[3], m[4], m[5], m[6] ?? "0"].map(Number);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || s > 59) return null;
  const wall = Date.UTC(y, mo - 1, d, h, mi, s);
  // Reject dates that roll over (e.g. Feb 31).
  const check = new Date(wall);
  if (check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return null;

  const DAY = 86_400_000;
  const offBefore = offsetAt(wall - DAY, timeZone);
  const offAfter = offsetAt(wall + DAY, timeZone);
  const candidates = [...new Set([wall - offBefore, wall - offAfter])].sort((a, b) => a - b);
  const valid = candidates.filter((c) => c + offsetAt(c, timeZone) === wall);
  if (valid.length) return new Date(valid[0]);
  // Gap: interpret with the pre-transition offset, which lands after the jump.
  return new Date(wall - offBefore);
}
