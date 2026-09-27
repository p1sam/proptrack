import { z } from "zod";
import { id, isoDateTime, optionalDateTime, optionalText } from "@/lib/validation/common";
import type { NormalizedTrade } from "./normalize";

/** Wire schemas shared by the import wizard (client) and the import actions (server). */

export const MAX_ROWS_PER_CALL = 5000;
/** Rows per request from the browser; keeps each server-action body well under Next's 1 MB default. */
export const CLIENT_CHUNK_SIZE = 1000;

const finite = z.number().refine(Number.isFinite, "Must be a number");
const positive = finite.refine((n) => n > 0, "Must be greater than 0");
const optionalPositive = positive.nullable().optional().transform((v) => v ?? null);

export const wireTradeSchema = z
  .object({
    row: z.number().int().min(0),
    symbol: z
      .string()
      .trim()
      .min(1)
      .max(32)
      .transform((s) => s.toUpperCase()),
    direction: z.enum(["LONG", "SHORT"]),
    openedAt: isoDateTime,
    closedAt: optionalDateTime,
    entryPrice: positive,
    exitPrice: optionalPositive,
    exitPriceKnown: z.boolean().default(true),
    quantity: positive,
    commission: finite.transform((n) => Math.abs(n)).default(0),
    swap: finite.default(0),
    grossPnl: finite.nullable().optional().transform((v) => v ?? null),
    stopLoss: optionalPositive,
    takeProfit: optionalPositive,
    externalId: optionalText(64),
    /** Import even when it matches an existing trade or an earlier row. */
    allowDuplicate: z.boolean().default(false),
  })
  .superRefine((t, ctx) => {
    if ((t.closedAt === null) !== (t.exitPrice === null)) ctx.addIssue({ code: "custom", path: ["exitPrice"], message: "Close time and exit price go together" });
    if (t.closedAt && t.closedAt.getTime() < t.openedAt.getTime()) ctx.addIssue({ code: "custom", path: ["closedAt"], message: "Close is before open" });
  });
export type WireTradeInput = z.input<typeof wireTradeSchema>;
export type WireTrade = z.output<typeof wireTradeSchema>;

export const importTradesSchema = z.object({
  accountId: id,
  source: z.string().min(1).max(40),
  filename: optionalText(200),
  /** Continue an existing batch (later chunks of a large file). */
  batchId: id.optional(),
  /** Data rows in the file (recorded on the batch). */
  fileRows: z.number().int().min(0).max(1_000_000).default(0),
  /** Rows the wizard left out (invalid, non-trade or duplicates the user skipped). */
  clientSkipped: z.number().int().min(0).max(1_000_000).default(0),
  rows: z.array(wireTradeSchema).max(MAX_ROWS_PER_CALL),
});
export type ImportTradesInput = z.input<typeof importTradesSchema>;
export type ImportTradesParsed = z.output<typeof importTradesSchema>;

export const duplicateCheckSchema = z.object({
  accountId: id,
  rows: z
    .array(
      z.object({
        row: z.number().int().min(0),
        symbol: z.string().trim().min(1).max(32),
        direction: z.enum(["LONG", "SHORT"]),
        openedAt: isoDateTime,
        closedAt: optionalDateTime,
        entryPrice: positive,
        exitPrice: optionalPositive,
        exitPriceKnown: z.boolean().default(true),
        quantity: positive,
      }),
    )
    .max(MAX_ROWS_PER_CALL),
});
export type DuplicateCheckInput = z.input<typeof duplicateCheckSchema>;

export const undoImportSchema = z.object({ batchId: id });

export function toWireTrade(t: NormalizedTrade, allowDuplicate = false): WireTradeInput {
  return {
    row: t.rowIndex,
    symbol: t.symbol,
    direction: t.direction,
    openedAt: t.openedAt.toISOString(),
    closedAt: t.closedAt ? t.closedAt.toISOString() : null,
    entryPrice: t.entryPrice,
    exitPrice: t.exitPrice,
    exitPriceKnown: t.exitPriceKnown,
    quantity: t.quantity,
    commission: t.commission,
    swap: t.swap,
    grossPnl: t.grossPnl,
    stopLoss: t.stopLoss,
    takeProfit: t.takeProfit,
    externalId: t.externalId,
    allowDuplicate,
  };
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
