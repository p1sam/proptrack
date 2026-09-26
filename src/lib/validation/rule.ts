import { z } from "zod";
import { parseHHMM } from "@/lib/calc/time";
import { id, optionalNumber } from "./common";

export const tradingRuleTypeEnum = z.enum([
  "MAX_RISK_PER_TRADE_PCT",
  "MAX_TRADES_PER_DAY",
  "MAX_LOSING_TRADES_PER_DAY",
  "MAX_CONSECUTIVE_LOSSES_PER_DAY",
  "MAX_DAILY_LOSS_PCT",
  "MAX_DAILY_LOSS_AMOUNT",
  "MAX_POSITION_SIZE",
  "TRADING_HOURS",
  "MIN_MINUTES_BETWEEN_TRADES",
]);
export type TradingRuleTypeKey = z.infer<typeof tradingRuleTypeEnum>;

/** Rule types whose value is a whole count. */
export const INTEGER_RULES: TradingRuleTypeKey[] = ["MAX_TRADES_PER_DAY", "MAX_LOSING_TRADES_PER_DAY", "MAX_CONSECUTIVE_LOSSES_PER_DAY", "MIN_MINUTES_BETWEEN_TRADES"];
export const PERCENT_RULES: TradingRuleTypeKey[] = ["MAX_RISK_PER_TRADE_PCT", "MAX_DAILY_LOSS_PCT"];

const hhmm = z
  .string()
  .optional()
  .nullable()
  .transform((v, ctx) => {
    if (!v || !v.trim()) return null;
    const m = parseHHMM(v);
    if (m === null) {
      ctx.addIssue({ code: "custom", message: "Use HH:MM (24-hour)" });
      return z.NEVER;
    }
    return m;
  });

const ruleFields = z.object({
  type: tradingRuleTypeEnum,
  value: optionalNumber,
  /** "HH:MM" in the user's timezone, TRADING_HOURS only. */
  start: hhmm,
  end: hhmm,
  /** null = every account. */
  accountId: id.nullable().optional().transform((v) => v ?? null),
  hardLimit: z.boolean().default(false),
  isActive: z.boolean().default(true),
});

function refineRule(r: z.infer<typeof ruleFields>, ctx: z.RefinementCtx) {
  if (r.type === "TRADING_HOURS") {
    if (r.start === null) ctx.addIssue({ code: "custom", path: ["start"], message: "Start time is required" });
    if (r.end === null) ctx.addIssue({ code: "custom", path: ["end"], message: "End time is required" });
    if (r.start !== null && r.end !== null && r.start === r.end) ctx.addIssue({ code: "custom", path: ["end"], message: "End must differ from start" });
    return;
  }
  if (r.value === null) {
    ctx.addIssue({ code: "custom", path: ["value"], message: "A limit is required" });
    return;
  }
  if (r.value <= 0 && r.type !== "MIN_MINUTES_BETWEEN_TRADES") ctx.addIssue({ code: "custom", path: ["value"], message: "Must be greater than 0" });
  if (r.value < 0) ctx.addIssue({ code: "custom", path: ["value"], message: "Cannot be negative" });
  if (INTEGER_RULES.includes(r.type) && !Number.isInteger(r.value)) ctx.addIssue({ code: "custom", path: ["value"], message: "Must be a whole number" });
  if (PERCENT_RULES.includes(r.type) && r.value > 100) ctx.addIssue({ code: "custom", path: ["value"], message: "Must be 100% or less" });
}

export const tradingRuleSchema = ruleFields.superRefine(refineRule);
export type TradingRuleInput = z.input<typeof tradingRuleSchema>;
export type TradingRuleParsed = z.output<typeof tradingRuleSchema>;

export const updateTradingRuleSchema = ruleFields.extend({ id }).superRefine(refineRule);
export type UpdateTradingRuleInput = z.input<typeof updateTradingRuleSchema>;
