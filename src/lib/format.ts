/** Display formatting. Values are already rounded by the calc layer; these only present them. */

const moneyCache = new Map<string, Intl.NumberFormat>();
function moneyFmt(currency: string, dp: number) {
  const key = `${currency}:${dp}`;
  let f = moneyCache.get(key);
  if (!f) {
    try {
      f = new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: dp, maximumFractionDigits: dp });
    } catch {
      f = new Intl.NumberFormat("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
    }
    moneyCache.set(key, f);
  }
  return f;
}

export function formatMoney(
  value: number | null | undefined,
  currency = "USD",
  opts: { sign?: boolean; dp?: number; compact?: boolean } = {},
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const dp = opts.dp ?? 2;
  if (opts.compact && Math.abs(value) >= 10_000) {
    const f = new Intl.NumberFormat("en-US", { style: "currency", currency, notation: "compact", maximumFractionDigits: 1 });
    const s = f.format(Math.abs(value));
    return `${value < 0 ? "−" : opts.sign && value > 0 ? "+" : ""}${s}`;
  }
  const s = moneyFmt(currency, dp).format(Math.abs(value));
  if (value < 0) return `−${s}`;
  if (opts.sign && value > 0) return `+${s}`;
  return s;
}

export function formatPct(value: number | null | undefined, opts: { sign?: boolean; dp?: number } = {}): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const dp = opts.dp ?? (Math.abs(value) >= 100 ? 0 : Math.abs(value) >= 10 ? 1 : 2);
  const s = Math.abs(value).toFixed(dp);
  if (value < 0) return `−${s}%`;
  return `${opts.sign && value > 0 ? "+" : ""}${s}%`;
}

export function formatR(value: number | null | undefined, dp = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const s = Math.abs(value).toFixed(dp);
  return `${value < 0 ? "−" : value > 0 ? "+" : ""}${s}R`;
}

export function formatNumber(value: number | null | undefined, dp = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: dp }).format(value);
}

export function formatRatio(value: number | null | undefined, dp = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return value.toFixed(dp);
}

const dtCache = new Map<string, Intl.DateTimeFormat>();
function dtf(tz: string, kind: "date" | "datetime" | "time" | "short") {
  const key = `${tz}:${kind}`;
  let f = dtCache.get(key);
  if (!f) {
    const o: Intl.DateTimeFormatOptions =
      kind === "date"
        ? { year: "numeric", month: "short", day: "numeric" }
        : kind === "time"
          ? { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }
          : kind === "short"
            ? { month: "short", day: "numeric" }
            : { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" };
    f = new Intl.DateTimeFormat("en-US", { ...o, timeZone: tz });
    dtCache.set(key, f);
  }
  return f;
}

export function formatDate(d: Date | string | null | undefined, tz = "UTC"): string {
  if (!d) return "—";
  return dtf(tz, "date").format(typeof d === "string" ? new Date(d) : d);
}
export function formatDateTime(d: Date | string | null | undefined, tz = "UTC"): string {
  if (!d) return "—";
  return dtf(tz, "datetime").format(typeof d === "string" ? new Date(d) : d);
}
export function formatTime(d: Date | string | null | undefined, tz = "UTC"): string {
  if (!d) return "—";
  return dtf(tz, "time").format(typeof d === "string" ? new Date(d) : d);
}
export function formatShortDate(d: Date | string | null | undefined, tz = "UTC"): string {
  if (!d) return "—";
  return dtf(tz, "short").format(typeof d === "string" ? new Date(d) : d);
}

/** Format a YYYY-MM-DD key without timezone shifting. */
export function formatDayKey(key: string, opts: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric" }): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { ...opts, timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d)));
}

export function formatMonthKey(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, 1)));
}

export function formatDuration(ms: number): string {
  const min = Math.round(ms / 60000);
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  if (h < 48) return `${h}h ${min % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

export function pnlTone(value: number | null | undefined): "profit" | "loss" | "neutral" {
  if (value === null || value === undefined || value === 0) return "neutral";
  return value > 0 ? "profit" : "loss";
}

export function humanize(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map((w, i) => (i === 0 ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}
