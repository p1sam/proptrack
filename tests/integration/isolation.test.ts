import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { provisionNewUser } from "@/server/services/provision";
import { rebuildAccount } from "@/server/services/rebuild";
import { getAccountState, getAccountSummary, listAccountSummaries } from "@/server/queries/accounts";
import { loadDataset } from "@/server/queries/dataset";
import { getFilterOptions } from "@/server/queries/options";
import { buildTradeWhere } from "@/server/queries/trade-where";
import { parseTradeFilters } from "@/lib/filters";
import { tradeFingerprint } from "@/lib/import/fingerprint";

/**
 * A user must never be able to read or change another user's data. These tests create two
 * throwaway users and try every read path with the *other* user's ids.
 */
const suffix = Math.random().toString(36).slice(2, 8);
const A = `test_iso_a_${suffix}`;
const B = `test_iso_b_${suffix}`;
let accountA = "";
let tradeA = "";

beforeAll(async () => {
  for (const id of [A, B]) {
    await prisma.user.create({ data: { id, name: id, email: `${id}@example.test` } });
    await provisionNewUser(id);
  }
  const acct = await prisma.tradingAccount.create({
    data: { userId: A, name: "A secret account", accountSize: 10000, startingBalance: 10000, rule: { create: { profitTargetPct: 8, maxOverallLossPct: 10, maxDailyLossPct: 5 } } },
  });
  accountA = acct.id;
  const inst = await prisma.instrument.findFirstOrThrow({ where: { userId: A, symbol: "EURUSD" } });
  const openedAt = new Date("2026-03-02T09:00:00Z");
  const closedAt = new Date("2026-03-02T10:00:00Z");
  const t = await prisma.trade.create({
    data: {
      userId: A,
      accountId: accountA,
      instrumentId: inst.id,
      symbol: "EURUSD",
      direction: "LONG",
      openedAt,
      entryPrice: 1.085,
      stopLoss: 1.083,
      quantity: 1,
      pointValue: 100000,
      commission: 7,
      fingerprint: tradeFingerprint({ accountId: accountA, symbol: "EURUSD", direction: "LONG", openedAt, entryPrice: 1.085, closedAt, exitPrice: 1.0875, quantity: 1 }),
      exits: { create: [{ price: 1.0875, quantity: 1, exitedAt: closedAt }] },
    },
  });
  tradeA = t.id;
  await rebuildAccount(A, accountA);
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: [A, B] } } });
  await prisma.$disconnect();
});

describe("rebuild computes derived data", () => {
  it("fills P&L, R and risk % from source fields", async () => {
    const t = await prisma.trade.findUniqueOrThrow({ where: { id: tradeA } });
    expect(Number(t.grossPnl)).toBe(250);
    expect(Number(t.netPnl)).toBe(243);
    expect(Number(t.initialRisk)).toBe(200);
    expect(Number(t.rMultiple)).toBe(1.215);
    expect(Number(t.riskPercent)).toBe(2);
    expect(t.status).toBe("CLOSED");
  });
  it("account state reflects the trade", async () => {
    const s = await getAccountState(A, accountA);
    expect(s?.balance).toBe(10243);
    expect(s?.profitTarget?.remaining).toBe(557);
  });
});

describe("user isolation", () => {
  it("account lists and lookups are scoped", async () => {
    expect((await listAccountSummaries(B)).map((a) => a.id)).not.toContain(accountA);
    expect(await getAccountSummary(B, accountA)).toBeNull();
    expect(await getAccountState(B, accountA)).toBeNull();
  });
  it("filtering by another user's account id returns nothing", async () => {
    const ds = await loadDataset(B, parseTradeFilters({ accounts: accountA }));
    expect(ds.trades).toHaveLength(0);
    const count = await prisma.trade.count({ where: buildTradeWhere(B, parseTradeFilters({ accounts: accountA, status: "ALL" }), { timezone: "UTC" }) });
    expect(count).toBe(0);
  });
  it("search cannot reach another user's trades", async () => {
    const count = await prisma.trade.count({ where: buildTradeWhere(B, parseTradeFilters({ q: "EURUSD", status: "ALL" }), { timezone: "UTC" }) });
    expect(count).toBe(0);
  });
  it("filter options contain only own data", async () => {
    const o = await getFilterOptions(B);
    expect(o.accounts.map((a) => a.id)).not.toContain(accountA);
  });
  it("rebuilding with the wrong user is a no-op", async () => {
    const before = await prisma.trade.findUniqueOrThrow({ where: { id: tradeA } });
    await prisma.trade.update({ where: { id: tradeA }, data: { commission: 100 } });
    await rebuildAccount(B, accountA);
    const after = await prisma.trade.findUniqueOrThrow({ where: { id: tradeA } });
    expect(Number(after.netPnl)).toBe(Number(before.netPnl));
    await prisma.trade.update({ where: { id: tradeA }, data: { commission: 7 } });
  });
  it("where builder always starts with the user id", () => {
    const w = buildTradeWhere(B, parseTradeFilters({ accounts: "x", firms: "y", q: "z" }), { timezone: "UTC" });
    expect((w.AND as object[])[0]).toEqual({ userId: B });
  });
});
