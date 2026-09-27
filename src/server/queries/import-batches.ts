import "server-only";
import { prisma } from "../db";
import { getUserPrefs } from "../services/ledger";

/** Recent import batches with how many of their trades still exist. */
export async function listImportBatches(userId: string, limit = 20) {
  const batches = await prisma.importBatch.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      source: true,
      filename: true,
      rowCount: true,
      importedCount: true,
      skippedCount: true,
      createdAt: true,
      account: { select: { id: true, name: true } },
      _count: { select: { trades: true } },
    },
  });
  return batches.map((b) => ({
    id: b.id,
    source: b.source,
    filename: b.filename,
    rowCount: b.rowCount,
    importedCount: b.importedCount,
    skippedCount: b.skippedCount,
    createdAt: b.createdAt.toISOString(),
    account: b.account,
    tradeCount: b._count.trades,
  }));
}
export type ImportBatchRow = Awaited<ReturnType<typeof listImportBatches>>[number];

/** Everything the import page needs: target accounts, the user's timezone, recent batches. */
export async function getImportPageData(userId: string) {
  const [accounts, prefs, batches] = await Promise.all([
    prisma.tradingAccount.findMany({
      where: { userId },
      select: { id: true, name: true, status: true, currency: true, accountNumber: true, _count: { select: { trades: true } } },
      orderBy: [{ createdAt: "desc" }],
    }),
    getUserPrefs(userId),
    listImportBatches(userId),
  ]);
  return {
    accounts: accounts.map((a) => ({ id: a.id, name: a.name, status: a.status, currency: a.currency, accountNumber: a.accountNumber, trades: a._count.trades })),
    timezone: prefs.timezone,
    batches,
  };
}
export type ImportPageData = Awaited<ReturnType<typeof getImportPageData>>;
export type ImportAccountOption = ImportPageData["accounts"][number];
