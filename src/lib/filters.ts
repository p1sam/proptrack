import { z } from "zod";
import { EMOTIONS } from "@/lib/calc/behavior";

/**
 * Trade filter model shared by the trade table, analytics, calendar and reports. Filters are
 * encoded in the URL (so views are linkable) and parsed with zod on the server.
 */

const list = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform((v) => (v === undefined ? [] : (Array.isArray(v) ? v : v.split(",")).map((s) => s.trim()).filter(Boolean)));
const optNum = z
  .string()
  .optional()
  .transform((v) => (v === undefined || v === "" || Number.isNaN(Number(v)) ? undefined : Number(v)));
const optDate = z
  .string()
  .optional()
  .transform((v) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined));

export const RANGE_PRESETS = ["today", "7d", "30d", "90d", "6m", "1y", "all"] as const;
export type RangePreset = (typeof RANGE_PRESETS)[number];

export const tradeFilterSchema = z.object({
  accounts: list,
  firms: list,
  strategies: list,
  symbols: list,
  sessions: list,
  setups: list,
  tags: list,
  weekdays: list,
  direction: z.enum(["LONG", "SHORT"]).optional().catch(undefined),
  outcome: z.enum(["WIN", "LOSS", "BREAKEVEN"]).optional().catch(undefined),
  status: z.enum(["OPEN", "CLOSED", "ALL"]).optional().catch(undefined),
  range: z.enum(RANGE_PRESETS).optional().catch(undefined),
  from: optDate,
  to: optDate,
  minPnl: optNum,
  maxPnl: optNum,
  minR: optNum,
  maxR: optNum,
  emotion: z.enum(EMOTIONS).optional().catch(undefined),
  emotionMin: optNum,
  emotionMax: optNum,
  q: z
    .string()
    .max(100)
    .optional()
    .transform((v) => v?.trim() || undefined),
});

export type TradeFilters = z.infer<typeof tradeFilterSchema>;

export function parseTradeFilters(params: Record<string, string | string[] | undefined> | URLSearchParams): TradeFilters {
  const obj: Record<string, string | string[]> = {};
  if (params instanceof URLSearchParams) {
    for (const key of new Set(params.keys())) {
      const all = params.getAll(key);
      obj[key] = all.length > 1 ? all : all[0];
    }
  } else {
    for (const [k, v] of Object.entries(params)) if (v !== undefined) obj[k] = v;
  }
  const r = tradeFilterSchema.safeParse(obj);
  return r.success ? r.data : tradeFilterSchema.parse({});
}

/** Resolve the range preset / explicit dates into YYYY-MM-DD bounds relative to `today`. */
export function resolveDateBounds(f: Pick<TradeFilters, "range" | "from" | "to">, today: string): { from?: string; to?: string } {
  if (f.from || f.to) return { from: f.from, to: f.to };
  if (!f.range || f.range === "all") return {};
  const [y, m, d] = today.split("-").map(Number);
  const base = new Date(Date.UTC(y, m - 1, d));
  const shift = (days: number) => {
    const x = new Date(base);
    x.setUTCDate(x.getUTCDate() - days);
    return x.toISOString().slice(0, 10);
  };
  const monthsBack = (n: number) => {
    const x = new Date(base);
    x.setUTCMonth(x.getUTCMonth() - n);
    return x.toISOString().slice(0, 10);
  };
  switch (f.range) {
    case "today":
      return { from: today, to: today };
    case "7d":
      return { from: shift(6), to: today };
    case "30d":
      return { from: shift(29), to: today };
    case "90d":
      return { from: shift(89), to: today };
    case "6m":
      return { from: monthsBack(6), to: today };
    case "1y":
      return { from: monthsBack(12), to: today };
  }
}

export function filtersToSearchParams(f: Partial<Record<keyof TradeFilters, unknown>>): URLSearchParams {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) {
    if (v === undefined || v === null || v === "") continue;
    if (Array.isArray(v)) {
      if (v.length) sp.set(k, v.join(","));
    } else sp.set(k, String(v));
  }
  return sp;
}

export function activeFilterCount(f: TradeFilters): number {
  let n = 0;
  for (const [k, v] of Object.entries(f)) {
    if (k === "range" || k === "status") continue;
    if (Array.isArray(v) ? v.length : v !== undefined) n++;
  }
  return n;
}
