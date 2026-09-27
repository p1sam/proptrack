import "server-only";
import { randomUUID } from "node:crypto";
import { num, numOrNull } from "@/lib/num";
import { candidateFingerprint, DUPLICATE_TOLERANCE_SEC, findExistingDuplicates, findFileDuplicates, type DuplicateCandidate, type DuplicateReport, type ExistingTradeLite } from "@/lib/import/duplicates";
import type { ImportTradesParsed, WireTrade } from "@/lib/import/schema";
import { prisma } from "../db";
import { UserError } from "../action";
import { rebuildAccount } from "./rebuild";

/**
 * Import write path. Everything is scoped by userId; the actions in server/actions/import.ts
 * are thin wrappers (auth, zod, rate limit, revalidation) around these functions.
 */

const INSERT_CHUNK = 1000;

async function assertAccount(userId: string, accountId: string) {
  const account = await prisma.tradingAccount.findFirst({ where: { id: accountId, userId }, select: { id: true, name: true } });
  if (!account) throw new UserError("Account not found");
  return account;
}

/** Existing trades of the account whose open time is near any candidate (±tolerance + 1 min). */
async function loadExistingNear(userId: string, accountId: string, candidates: { openedAt: Date }[]): Promise<ExistingTradeLite[]> {
  if (!candidates.length) return [];
  const pad = (DUPLICATE_TOLERANCE_SEC + 60) * 1000;
  let min = Infinity;
  let max = -Infinity;
  for (const c of candidates) {
    const t = c.openedAt.getTime();
    if (t < min) min = t;
    if (t > max) max = t;
  }
  const rows = await prisma.trade.findMany({
    where: { userId, accountId, openedAt: { gte: new Date(min - pad), lte: new Date(max + pad) } },
    select: { id: true, symbol: true, direction: true, openedAt: true, closedAt: true, entryPrice: true, exitPrice: true, quantity: true, fingerprint: true },
  });
  return rows.map((r) => ({ ...r, entryPrice: num(r.entryPrice), exitPrice: numOrNull(r.exitPrice), quantity: num(r.quantity) }));
}

const toCandidate = (r: { row: number; symbol: string; direction: "LONG" | "SHORT"; openedAt: Date; closedAt: Date | null; entryPrice: number; exitPrice: number | null; exitPriceKnown: boolean; quantity: number }): DuplicateCandidate => ({
  row: r.row,
  symbol: r.symbol.toUpperCase(),
  direction: r.direction,
  openedAt: r.openedAt,
  closedAt: r.closedAt,
  entryPrice: r.entryPrice,
  exitPrice: r.exitPrice,
  exitPriceKnown: r.exitPriceKnown,
  quantity: r.quantity,
});

/** Duplicates of the candidate rows against the account's trades and within the rows themselves. */
export async function checkImportDuplicates(
  userId: string,
  accountId: string,
  rows: Parameters<typeof toCandidate>[0][],
): Promise<DuplicateReport> {
  await assertAccount(userId, accountId);
  const candidates = rows.map(toCandidate);
  const existing = await loadExistingNear(userId, accountId, candidates);
  const matches = findExistingDuplicates(accountId, candidates, existing);
  const ids = [...new Set(matches.map((m) => m.tradeId))];
  const details = ids.length
    ? await prisma.trade.findMany({ where: { userId, id: { in: ids } }, select: { id: true, symbol: true, direction: true, openedAt: true, entryPrice: true, quantity: true, netPnl: true, source: true } })
    : [];
  const byId = new Map(details.map((d) => [d.id, d]));
  return {
    existing: matches.flatMap((m) => {
      const d = byId.get(m.tradeId);
      if (!d) return [];
      return [{ row: m.row, kind: m.kind, trade: { id: d.id, symbol: d.symbol, direction: d.direction, openedAt: d.openedAt.toISOString(), entryPrice: num(d.entryPrice), quantity: num(d.quantity), netPnl: numOrNull(d.netPnl), source: d.source } }];
    }),
    file: findFileDuplicates(accountId, candidates),
  };
}

export interface ImportResult {
  batchId: string;
  accountId: string;
  imported: number;
  skippedDuplicates: number;
  /** Rows the server skipped because they duplicate an earlier row of the same request. */
  skippedInFile: number;
  instrumentsCreated: number;
}

/**
 * Write one chunk of normalized trades: instruments, batch, trades and exits via createMany
 * in a single transaction, then one rebuild of the account. Duplicates (vs existing trades,
 * including earlier chunks of the same file, and within this chunk) are skipped unless the
 * row says allowDuplicate.
 */
export async function importTradesForUser(userId: string, input: ImportTradesParsed): Promise<ImportResult> {
  await assertAccount(userId, input.accountId);
  if (input.batchId) {
    const batch = await prisma.importBatch.findFirst({ where: { id: input.batchId, userId, accountId: input.accountId }, select: { id: true } });
    if (!batch) throw new UserError("Import batch not found");
  }

  const rows = input.rows;
  const candidates = rows.map(toCandidate);
  const existing = await loadExistingNear(userId, input.accountId, candidates);
  const dupExisting = new Set(findExistingDuplicates(input.accountId, candidates, existing).map((d) => d.row));
  const dupFile = new Set(findFileDuplicates(input.accountId, candidates).map((d) => d.row));
  const keep: WireTrade[] = [];
  let skippedDuplicates = 0;
  let skippedInFile = 0;
  for (const r of rows) {
    if (!r.allowDuplicate && dupExisting.has(r.row)) skippedDuplicates++;
    else if (!r.allowDuplicate && dupFile.has(r.row)) skippedInFile++;
    else keep.push(r);
  }

  const symbols = [...new Set(keep.map((r) => r.symbol))];
  const result = await prisma.$transaction(
    async (tx) => {
      const known = await tx.instrument.findMany({ where: { userId, symbol: { in: symbols } }, select: { id: true, symbol: true, pointValue: true } });
      const missing = symbols.filter((s) => !known.some((k) => k.symbol === s));
      if (missing.length) {
        await tx.instrument.createMany({ data: missing.map((symbol) => ({ id: randomUUID(), userId, symbol, pointValue: 1 })), skipDuplicates: true });
        known.push(...(await tx.instrument.findMany({ where: { userId, symbol: { in: missing } }, select: { id: true, symbol: true, pointValue: true } })));
      }
      const instrumentBySymbol = new Map(known.map((k) => [k.symbol, k]));

      const skipped = skippedDuplicates + skippedInFile + input.clientSkipped;
      const batch = input.batchId
        ? await tx.importBatch.update({
            where: { id: input.batchId },
            data: { importedCount: { increment: keep.length }, skippedCount: { increment: skipped } },
            select: { id: true },
          })
        : await tx.importBatch.create({
            data: {
              userId,
              accountId: input.accountId,
              source: input.source,
              filename: input.filename,
              rowCount: Math.max(input.fileRows, rows.length + input.clientSkipped),
              importedCount: keep.length,
              skippedCount: skipped,
            },
            select: { id: true },
          });

      const trades = keep.map((r) => {
        const instrument = instrumentBySymbol.get(r.symbol)!;
        const closed = r.closedAt !== null && r.exitPrice !== null;
        return {
          id: randomUUID(),
          row: r,
          closed,
          data: {
            userId,
            accountId: input.accountId,
            instrumentId: instrument.id,
            symbol: r.symbol,
            direction: r.direction,
            status: closed ? ("CLOSED" as const) : ("OPEN" as const),
            openedAt: r.openedAt,
            closedAt: closed ? r.closedAt : null,
            entryPrice: r.entryPrice,
            exitPrice: closed ? r.exitPrice : null,
            stopLoss: r.stopLoss,
            takeProfit: r.takeProfit,
            quantity: r.quantity,
            pointValue: instrument.pointValue,
            commission: r.commission,
            swap: r.swap,
            reportedGrossPnl: closed ? r.grossPnl : null,
            source: "CSV" as const,
            externalId: r.externalId,
            importBatchId: batch.id,
            fingerprint: candidateFingerprint(input.accountId, toCandidate(r)),
          },
        };
      });
      for (let i = 0; i < trades.length; i += INSERT_CHUNK) {
        const part = trades.slice(i, i + INSERT_CHUNK);
        await tx.trade.createMany({ data: part.map((t) => ({ id: t.id, ...t.data })) });
        const exits = part.filter((t) => t.closed).map((t) => ({ id: randomUUID(), tradeId: t.id, price: t.row.exitPrice!, quantity: t.row.quantity, exitedAt: t.row.closedAt! }));
        if (exits.length) await tx.tradeExit.createMany({ data: exits });
      }
      return { batchId: batch.id, instrumentsCreated: missing.length };
    },
    { timeout: 120_000, maxWait: 20_000 },
  );

  if (keep.length) await rebuildAccount(userId, input.accountId);
  return { batchId: result.batchId, accountId: input.accountId, imported: keep.length, skippedDuplicates, skippedInFile, instrumentsCreated: result.instrumentsCreated };
}

/** Delete every trade of an import batch (and the batch), then rebuild the account. */
export async function undoImportBatch(userId: string, batchId: string) {
  const batch = await prisma.importBatch.findFirst({ where: { id: batchId, userId }, select: { id: true, accountId: true } });
  if (!batch) throw new UserError("Import not found");
  const deleted = await prisma.$transaction(async (tx) => {
    const r = await tx.trade.deleteMany({ where: { userId, importBatchId: batch.id } });
    await tx.importBatch.delete({ where: { id: batch.id } });
    return r.count;
  });
  await rebuildAccount(userId, batch.accountId);
  // Tidy up trade groups left without members (a copy-linked imported trade may have been deleted).
  await prisma.tradeGroup.deleteMany({ where: { userId, trades: { none: {} } } });
  return { deleted, accountId: batch.accountId };
}
