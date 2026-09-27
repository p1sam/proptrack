import { z } from "zod";
import { isValidTimeZone, parseHHMM } from "@/lib/calc/time";
import { currency, id, nonNegativeOptional, optionalNumber, optionalText, pctOptional } from "./common";

/** Shared zod schemas for the Settings forms (client) and actions (server). */

export const timeZone = z
  .string()
  .trim()
  .min(1, "Choose a timezone")
  .refine((tz) => isValidTimeZone(tz), "Unknown IANA timezone");

/** Optional user-picked colour; "" / null / undefined mean "no colour". */
export const hexColor = z
  .union([z.literal(""), z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a hex colour like #3b82f6")])
  .optional()
  .nullable()
  .transform((v) => v || null);

const name = (max = 60) => z.string().trim().min(1, "Required").max(max, `At most ${max} characters`);

const wholeOptional = (min: number, max: number) =>
  optionalNumber.refine((n) => n === null || (Number.isInteger(n) && n >= min && n <= max), `Whole number between ${min} and ${max}`);

// ─── Profile ────────────────────────────────────────────────────────────────

export const profileSchema = z.object({ name: name(80) });

export const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password").max(128),
    newPassword: z.string().min(10, "At least 10 characters").max(128, "At most 128 characters"),
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, { path: ["confirmPassword"], message: "Passwords do not match" })
  .refine((v) => v.newPassword !== v.currentPassword, { path: ["newPassword"], message: "Choose a different password" });

// ─── Preferences ────────────────────────────────────────────────────────────

export const preferencesSchema = z.object({
  defaultCurrency: currency,
  timezone: timeZone,
  riskPercent: pctOptional,
  maxTradesPerDay: wholeOptional(1, 500),
  maxDailyLossPct: pctOptional,
  defaultRR: optionalNumber.refine((n) => n === null || (n > 0 && n <= 100), "Between 0 and 100"),
  breakevenTolerance: nonNegativeOptional.transform((n) => n ?? 0),
  insightMinTrades: wholeOptional(1, 10000).transform((n) => n ?? 20),
});
export type PreferencesInput = z.input<typeof preferencesSchema>;

// ─── Sessions ───────────────────────────────────────────────────────────────

const hhmm = z
  .string()
  .trim()
  .transform((v, ctx) => {
    const m = parseHHMM(v);
    if (m === null) {
      ctx.addIssue({ code: "custom", message: "Use HH:MM (24h)" });
      return z.NEVER;
    }
    return m;
  });

export const sessionSchema = z
  .object({
    id: id.optional(),
    name: name(40),
    timezone: timeZone,
    start: hhmm,
    end: hhmm,
    priority: z.coerce.number().int("Whole number").min(0).max(10000),
    color: hexColor,
    isActive: z.boolean().default(true),
  })
  .refine((v) => v.start !== v.end, { path: ["end"], message: "End must differ from start (use 00:00–23:59 for all day)" });
export type SessionInput = z.input<typeof sessionSchema>;

// ─── Strategies, instruments, tags, categories ──────────────────────────────

export const strategySchema = z.object({
  id: id.optional(),
  name: name(60),
  description: optionalText(1000),
  color: hexColor,
  isArchived: z.boolean().default(false),
});

export const assetClassEnum = z.enum(["FOREX", "INDEX", "COMMODITY", "CRYPTO", "STOCK", "FUTURES", "OTHER"]);

export const instrumentSchema = z.object({
  id: id.optional(),
  symbol: z
    .string()
    .trim()
    .min(1, "Required")
    .max(30)
    .regex(/^[A-Za-z0-9._/!:-]+$/, "Letters, digits and . _ / - : only")
    .transform((s) => s.toUpperCase()),
  name: optionalText(80),
  assetClass: assetClassEnum.default("OTHER"),
  pointValue: optionalNumber.refine((n) => n !== null && n > 0, "Must be greater than 0").transform((n) => n as number),
  tickSize: optionalNumber.refine((n) => n === null || n > 0, "Must be greater than 0"),
});

export const tagKindEnum = z.enum(["POSITIVE", "MISTAKE", "NEUTRAL"]);
export const tagSchema = z.object({
  id: id.optional(),
  name: name(40),
  kind: tagKindEnum.default("NEUTRAL"),
  color: hexColor,
  isDefault: z.boolean().default(false),
});

export const categoryKindEnum = z.enum(["SETUP", "TIMEFRAME", "TRADE_TYPE", "ENTRY_MODEL", "CONFLUENCE", "MARKET_CONDITION"]);
export const categorySchema = z.object({
  id: id.optional(),
  kind: categoryKindEnum,
  name: name(60),
});

// ─── Exchange rates ─────────────────────────────────────────────────────────

export const exchangeRateSchema = z
  .object({
    id: id.optional(),
    base: currency,
    quote: currency,
    rate: optionalNumber.refine((n) => n !== null && n > 0 && n < 1e9, "Must be greater than 0").transform((n) => n as number),
  })
  .refine((v) => v.base !== v.quote, { path: ["quote"], message: "Quote must differ from base" });

export const idSchema = z.object({ id });
