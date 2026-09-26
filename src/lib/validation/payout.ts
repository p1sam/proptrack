import { z } from "zod";
import { payoutIssues } from "@/lib/calc/payouts";
import { currency, id, isoDateTime, nonNegativeOptional, optionalDateTime, optionalText, pctOptional, positiveNumber } from "./common";

export const payoutStatusEnum = z.enum(["PENDING", "REQUESTED", "APPROVED", "PAID", "REJECTED"]);

const payoutFields = z.object({
  accountId: id,
  status: payoutStatusEnum.default("REQUESTED"),
  requestedAt: optionalDateTime,
  approvedAt: optionalDateTime,
  paidAt: optionalDateTime,
  /** Gross amount withdrawn from the trading account. */
  amountRequested: positiveNumber,
  profitSplitPct: pctOptional,
  fees: nonNegativeOptional.transform((v) => v ?? 0),
  amountReceived: nonNegativeOptional,
  paymentMethod: optionalText(64),
  currency: currency.optional(),
  deductFromBalance: z.boolean().default(true),
  notes: optionalText(2000),
  /** When the payout becomes PAID on a FUNDED / PAYOUT_ELIGIBLE account, set the account to PAYOUT_RECEIVED. */
  markAccountReceived: z.boolean().default(true),
});

/** Errors from payoutIssues reject the input; warnings are shown in the form only. */
function refineIssues(p: z.infer<typeof payoutFields>, ctx: z.RefinementCtx) {
  for (const issue of payoutIssues(p)) if (issue.level === "error") ctx.addIssue({ code: "custom", path: [issue.field], message: issue.message });
}

export const payoutSchema = payoutFields.superRefine(refineIssues);
export type PayoutInput = z.input<typeof payoutSchema>;
export type PayoutParsed = z.output<typeof payoutSchema>;

export const updatePayoutSchema = payoutFields.extend({ id }).superRefine(refineIssues);
export type UpdatePayoutInput = z.input<typeof updatePayoutSchema>;

/** Quick status change from the table: mark requested / approved / paid / rejected. */
export const payoutTransitionSchema = z
  .object({
    id,
    to: z.enum(["REQUESTED", "APPROVED", "PAID", "REJECTED"]),
    at: isoDateTime,
    amountReceived: nonNegativeOptional,
    markAccountReceived: z.boolean().default(true),
  })
  .superRefine((v, ctx) => {
    if (v.to === "PAID" && v.amountReceived === null) ctx.addIssue({ code: "custom", path: ["amountReceived"], message: "Enter the amount received." });
  });
export type PayoutTransitionInput = z.input<typeof payoutTransitionSchema>;
