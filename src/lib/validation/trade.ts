import { z } from "zod";
import { id, isoDateTime, nonNegativeOptional, optionalNumber, optionalText, positiveNumber } from "./common";

const rating = z
  .union([z.number(), z.string(), z.null(), z.undefined()])
  .transform((v) => (v === null || v === undefined || v === "" ? null : Number(v)))
  .refine((v) => v === null || (Number.isInteger(v) && v >= 1 && v <= 5), "Rate 1–5");

export const journalSchema = z.object({
  reason: optionalText(4000),
  thesis: optionalText(4000),
  setupExplanation: optionalText(4000),
  expectedOutcome: optionalText(4000),
  riskJustification: optionalText(4000),
  whatHappened: optionalText(4000),
  followedPlan: z.boolean().nullable().optional().transform((v) => v ?? null),
  changes: optionalText(4000),
  wentWell: optionalText(4000),
  wentWrong: optionalText(4000),
  lesson: optionalText(4000),
  emotionalState: optionalText(1000),
  mistakes: optionalText(4000),
  confidence: rating,
  stress: rating,
  fear: rating,
  greed: rating,
  patience: rating,
  fomo: rating,
  revenge: rating,
  boredom: rating,
  discipline: rating,
});
export type JournalInput = z.input<typeof journalSchema>;

export const exitSchema = z.object({
  price: positiveNumber,
  quantity: positiveNumber,
  exitedAt: isoDateTime,
});

export const copySchema = z.object({
  accountId: id,
  quantity: optionalNumber,
  commission: nonNegativeOptional,
  swap: optionalNumber,
  reportedGrossPnl: optionalNumber,
});

export const gradeEnum = z.enum(["A_PLUS", "A", "B", "C", "D", "F"]);

export const tradeSchema = z
  .object({
    accountId: id,
    symbol: z
      .string()
      .trim()
      .min(1, "Instrument is required")
      .max(32)
      .transform((s) => s.toUpperCase()),
    pointValue: optionalNumber.refine((n) => n === null || n > 0, "Must be greater than 0"),
    direction: z.enum(["LONG", "SHORT"]),
    openedAt: isoDateTime,
    entryPrice: positiveNumber,
    stopLoss: optionalNumber.refine((n) => n === null || n > 0, "Must be greater than 0"),
    takeProfit: optionalNumber.refine((n) => n === null || n > 0, "Must be greater than 0"),
    quantity: positiveNumber,
    exits: z.array(exitSchema).max(20).default([]),
    commission: nonNegativeOptional.transform((n) => n ?? 0),
    swap: optionalNumber.transform((n) => n ?? 0),
    reportedGrossPnl: optionalNumber,
    riskAmountOverride: nonNegativeOptional,
    mfePrice: optionalNumber,
    maePrice: optionalNumber,
    strategyId: id.nullable().optional(),
    setup: optionalText(80),
    timeframe: optionalText(20),
    tradeType: optionalText(40),
    entryModel: optionalText(80),
    confluences: z.array(z.string().trim().min(1).max(60)).max(20).default([]),
    marketCondition: optionalText(60),
    grade: gradeEnum.nullable().optional(),
    tagIds: z.array(id).max(30).default([]),
    notes: optionalText(10000),
    journal: journalSchema.optional(),
    copies: z.array(copySchema).max(20).default([]),
  })
  .superRefine((t, ctx) => {
    const exitQty = t.exits.reduce((a, e) => a + e.quantity, 0);
    if (exitQty > t.quantity + 1e-9) ctx.addIssue({ code: "custom", path: ["exits"], message: "Exit quantity exceeds position size" });
    t.exits.forEach((e, i) => {
      if (e.exitedAt.getTime() < t.openedAt.getTime()) ctx.addIssue({ code: "custom", path: ["exits", i, "exitedAt"], message: "Exit is before entry" });
    });
    if (t.copies.some((c) => c.accountId === t.accountId)) ctx.addIssue({ code: "custom", path: ["copies"], message: "A copy cannot target the primary account" });
    if (new Set(t.copies.map((c) => c.accountId)).size !== t.copies.length) ctx.addIssue({ code: "custom", path: ["copies"], message: "Duplicate copy account" });
  });
export type TradeInput = z.input<typeof tradeSchema>;
export type TradeParsed = z.output<typeof tradeSchema>;

/** Soft warnings shown in the form (not validation errors). */
export function tradeWarnings(t: { direction: "LONG" | "SHORT"; entryPrice: number; stopLoss?: number | null; takeProfit?: number | null }): string[] {
  const w: string[] = [];
  if (t.stopLoss != null) {
    const wrong = t.direction === "LONG" ? t.stopLoss >= t.entryPrice : t.stopLoss <= t.entryPrice;
    if (wrong) w.push("Stop loss is not on the losing side of entry — risk and R will be left blank.");
  }
  if (t.takeProfit != null) {
    const wrong = t.direction === "LONG" ? t.takeProfit <= t.entryPrice : t.takeProfit >= t.entryPrice;
    if (wrong) w.push("Take profit is not on the winning side of entry — planned R:R will be left blank.");
  }
  return w;
}
