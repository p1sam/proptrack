"use server";

import { revalidatePath } from "next/cache";
import { duplicateCheckSchema, importTradesSchema, undoImportSchema } from "@/lib/import/schema";
import { IMPORT_SOURCE_IDS } from "@/lib/import/adapters";
import { createAction, UserError } from "../action";
import { enforceRateLimit } from "../rate-limit";
import { checkImportDuplicates, importTradesForUser, undoImportBatch } from "../services/import";

const TEN_MINUTES = 600;

/** Duplicate check for the wizard's Validate step. */
export const checkImportDuplicatesAction = createAction(duplicateCheckSchema, async (input, user) => {
  await enforceRateLimit(`import-check:${user.id}`, { window: TEN_MINUTES, max: 120 });
  return checkImportDuplicates(
    user.id,
    input.accountId,
    input.rows.map((r) => ({ ...r, symbol: r.symbol.toUpperCase() })),
  );
});

/**
 * Import one chunk of normalized trades. The first chunk of a file creates the ImportBatch
 * (10 imports per 10 minutes per user); later chunks pass its batchId.
 */
export const importTrades = createAction(importTradesSchema, async (input, user) => {
  if (!IMPORT_SOURCE_IDS.includes(input.source)) throw new UserError("Unknown import source");
  if (input.batchId) await enforceRateLimit(`import-chunk:${user.id}`, { window: TEN_MINUTES, max: 200 });
  else await enforceRateLimit(`import:${user.id}`, { window: TEN_MINUTES, max: 10 });
  const result = await importTradesForUser(user.id, input);
  revalidatePath("/", "layout");
  return result;
});

export const undoImport = createAction(undoImportSchema, async ({ batchId }, user) => {
  await enforceRateLimit(`import-undo:${user.id}`, { window: TEN_MINUTES, max: 30 });
  const result = await undoImportBatch(user.id, batchId);
  revalidatePath("/", "layout");
  return result;
});
