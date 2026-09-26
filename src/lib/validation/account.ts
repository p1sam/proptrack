import { z } from "zod";
import { currency, id, isoDateTime, nonNegativeOptional, optionalDateTime, optionalNumber, optionalText, pctOptional, positiveNumber } from "./common";

export const accountStatusEnum = z.enum(["CHALLENGE", "PASSED", "FUNDED", "PAYOUT_ELIGIBLE", "PAYOUT_RECEIVED", "FAILED", "BREACHED", "SUSPENDED", "ARCHIVED"]);
export const accountTypeEnum = z.enum(["ONE_STEP", "TWO_STEP", "THREE_STEP", "INSTANT_FUNDED", "FUNDED", "PERSONAL", "OTHER"]);
export const feeTypeEnum = z.enum(["CHALLENGE", "RESET", "ACTIVATION", "SUBSCRIPTION", "DATA", "OTHER"]);
export const eventTypeEnum = z.enum([
  "CHALLENGE_PURCHASED",
  "CHALLENGE_STARTED",
  "PHASE_PASSED",
  "CHALLENGE_PASSED",
  "FUNDED_ACTIVATED",
  "PAYOUT_REQUESTED",
  "PAYOUT_APPROVED",
  "PAYOUT_RECEIVED",
  "PAYOUT_REJECTED",
  "ACCOUNT_BREACHED",
  "ACCOUNT_FAILED",
  "ACCOUNT_RESET",
  "ACCOUNT_SUSPENDED",
  "ACCOUNT_CLOSED",
  "STATUS_CHANGED",
  "NOTE",
]);

export const ruleSchema = z.object({
  profitTargetPct: pctOptional,
  maxDailyLossPct: pctOptional,
  dailyLossBasis: z.enum(["STARTING_BALANCE", "DAY_START_BALANCE"]).default("STARTING_BALANCE"),
  maxOverallLossPct: pctOptional,
  drawdownType: z.enum(["STATIC", "TRAILING_EOD", "TRAILING_BALANCE"]).default("STATIC"),
  trailingLocksAtStart: z.boolean().default(true),
  minTradingDays: optionalNumber.refine((n) => n === null || (Number.isInteger(n) && n >= 0), "Whole number of days"),
  maxTradingDays: optionalNumber.refine((n) => n === null || (Number.isInteger(n) && n > 0), "Whole number of days"),
  maxPositionSize: nonNegativeOptional,
  maxOpenContracts: nonNegativeOptional,
  newsTradingAllowed: z.boolean().default(true),
  weekendHoldingAllowed: z.boolean().default(true),
  consistencyPct: pctOptional,
  payoutThresholdAmount: nonNegativeOptional,
  payoutFrequencyDays: optionalNumber.refine((n) => n === null || (Number.isInteger(n) && n >= 0), "Whole number of days"),
  profitSplitPct: pctOptional,
  dayResetHour: z.coerce.number().int().min(0).max(23).default(0),
  dayResetTimezone: optionalText(64),
});
export type RuleInput = z.input<typeof ruleSchema>;

export const accountBaseSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  propFirmId: id.nullable().optional(),
  newPropFirmName: optionalText(80),
  accountNumber: optionalText(64),
  accountSize: positiveNumber,
  startingBalance: optionalNumber,
  currency: currency.default("USD"),
  accountType: accountTypeEnum.default("TWO_STEP"),
  phase: optionalNumber,
  status: accountStatusEnum.default("CHALLENGE"),
  purchasedAt: optionalDateTime,
  startedAt: optionalDateTime,
  notes: optionalText(4000),
});

export const createAccountSchema = accountBaseSchema.extend({
  challengeFee: nonNegativeOptional,
  feeCurrency: currency.optional(),
  rule: ruleSchema.optional(),
});
export type CreateAccountInput = z.input<typeof createAccountSchema>;

export const updateAccountSchema = accountBaseSchema.extend({ id });

export const changeStatusSchema = z.object({
  accountId: id,
  status: accountStatusEnum,
  occurredAt: isoDateTime,
  notes: optionalText(2000),
});

export const advanceAccountSchema = z.object({
  accountId: id,
  kind: z.enum(["NEXT_PHASE", "FUNDED", "RESET"]),
  name: z.string().trim().min(1).max(80),
  accountNumber: optionalText(64),
  startingBalance: positiveNumber,
  startedAt: isoDateTime,
  fee: nonNegativeOptional,
  keepRules: z.boolean().default(true),
});

export const eventSchema = z.object({
  accountId: id,
  type: eventTypeEnum,
  occurredAt: isoDateTime,
  amount: optionalNumber,
  notes: optionalText(2000),
});

export const feeSchema = z.object({
  accountId: id,
  type: feeTypeEnum,
  amount: positiveNumber,
  currency: currency.optional(),
  paidAt: isoDateTime,
  refunded: nonNegativeOptional,
  notes: optionalText(500),
});

export const propFirmSchema = z.object({
  id: id.optional(),
  name: z.string().trim().min(1).max(80),
  website: z
    .string()
    .trim()
    .max(200)
    .optional()
    .nullable()
    .transform((v) => v || null)
    .refine((v) => v === null || /^https?:\/\//i.test(v), "Must start with http:// or https://"),
  notes: optionalText(2000),
  ruleTemplate: ruleSchema.partial().optional().nullable(),
});
