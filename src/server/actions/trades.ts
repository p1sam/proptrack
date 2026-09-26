"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { averageExitPrice, computeTrade } from "@/lib/calc/trade";
import { wouldBreakHardLimit, type PersonalRule } from "@/lib/calc/personal-rules";
import { dayKey } from "@/lib/calc/time";
import { tradeFingerprint } from "@/lib/import/fingerprint";
import { num, numOrNull } from "@/lib/num";
import { id } from "@/lib/validation/common";
import { journalSchema, tradeSchema, type TradeParsed } from "@/lib/validation/trade";
import { prisma } from "../db";
import { createAction, UserError } from "../action";
import { rebuildAccount } from "../services/rebuild";
import { balanceAtFactory, getUserPrefs, withdrawalsOf } from "../services/ledger";
import { getStorage } from "../storage";

async function resolveInstrument(userId: string, symbol: string, pointValue: number | null) {
  const existing = await prisma.instrument.findUnique({ where: { userId_symbol: { userId, symbol } } });
  if (existing) return existing;
  return prisma.instrument.create({ data: { userId, symbol, pointValue: pointValue ?? 1 } });
}

async function assertOwnership(userId: string, input: TradeParsed) {
  const accountIds = [input.accountId, ...input.copies.map((c) => c.accountId)];
  const owned = await prisma.tradingAccount.count({ where: { userId, id: { in: accountIds } } });
  if (owned !== accountIds.length) throw new UserError("Account not found");
  if (input.strategyId && !(await prisma.strategy.count({ where: { id: input.strategyId, userId } }))) throw new UserError("Strategy not found");
  if (input.tagIds.length && (await prisma.tradeTag.count({ where: { userId, id: { in: input.tagIds } } })) !== new Set(input.tagIds).size)
    throw new UserError("Tag not found");
}

/** Enforce the user's hard-limit personal rules for a new manual trade on one account. */
async function checkHardLimits(userId: string, accountId: string, t: { openedAt: Date; quantity: number; risk: number | null }) {
  const rules = await prisma.tradingRule.findMany({ where: { userId, isActive: true, hardLimit: true, OR: [{ accountId: null }, { accountId }] } });
  if (!rules.length) return;
  const prefs = await getUserPrefs(userId);
  const account = await prisma.tradingAccount.findFirstOrThrow({ where: { id: accountId, userId }, include: { payouts: true } });
  const day = dayKey(t.openedAt, prefs.timezone);
  const trades = await prisma.trade.findMany({
    where: { accountId, openedAt: { gte: new Date(t.openedAt.getTime() - 36 * 3600_000), lte: new Date(t.openedAt.getTime() + 36 * 3600_000) } },
  });
  const allClosed = await prisma.trade.findMany({ where: { accountId, status: "CLOSED" }, select: { closedAt: true, netPnl: true } });
  const balanceAt = balanceAtFactory(num(account.startingBalance), [
    ...allClosed.filter((x) => x.closedAt && x.netPnl !== null).map((x) => ({ at: x.closedAt!, delta: num(x.netPnl) })),
    ...withdrawalsOf(account).map((w) => ({ at: w.at, delta: -w.amount })),
  ]);
  const balance = balanceAt(t.openedAt);
  const existing = trades
    .map((x) => ({
      id: x.id,
      openedAt: x.openedAt,
      closedAt: x.closedAt,
      day: dayKey(x.openedAt, prefs.timezone),
      netPnl: numOrNull(x.netPnl),
      riskPercent: numOrNull(x.riskPercent),
      quantity: num(x.quantity),
    }))
    .filter((x) => x.day === day);
  const firstOpen = existing.reduce<Date | null>((m, x) => (!m || x.openedAt < m ? x.openedAt : m), null) ?? t.openedAt;
  const personal: PersonalRule[] = rules.map((r) => ({ id: r.id, type: r.type, value: numOrNull(r.value), startMinute: r.startMinute, endMinute: r.endMinute, hardLimit: true }));
  const violations = wouldBreakHardLimit(
    existing,
    { id: "__candidate__", openedAt: t.openedAt, closedAt: null, day, netPnl: null, riskPercent: t.risk !== null && balance > 0 ? (t.risk / balance) * 100 : null, quantity: t.quantity },
    personal,
    { timezone: prefs.timezone, tolerance: prefs.breakevenTolerance, dayStartBalance: () => balanceAt(firstOpen) },
  );
  if (violations.length) throw new UserError(`Blocked by hard limit: ${violations.map((v) => v.message.replace(/^Hard limit: /, "")).join(" ")}`);
}

function tradeData(input: TradeParsed, overrides: { accountId: string; quantity: number; commission: number; swap: number; reportedGrossPnl: number | null }, pointValue: number) {
  // Scale exits proportionally when a copy uses a different size.
  const scale = overrides.quantity / input.quantity;
  const exits = input.exits.map((e) => ({ price: e.price, quantity: Math.round(e.quantity * scale * 1e6) / 1e6, exitedAt: e.exitedAt }));
  const closedAt = exits.length ? new Date(Math.max(...exits.map((e) => e.exitedAt.getTime()))) : null;
  return {
    exits,
    fingerprint: tradeFingerprint({
      accountId: overrides.accountId,
      symbol: input.symbol,
      direction: input.direction,
      openedAt: input.openedAt,
      entryPrice: input.entryPrice,
      closedAt,
      exitPrice: averageExitPrice(exits),
      quantity: overrides.quantity,
    }),
    data: {
      accountId: overrides.accountId,
      symbol: input.symbol,
      direction: input.direction,
      openedAt: input.openedAt,
      closedAt,
      entryPrice: input.entryPrice,
      stopLoss: input.stopLoss,
      takeProfit: input.takeProfit,
      quantity: overrides.quantity,
      pointValue,
      commission: overrides.commission,
      swap: overrides.swap,
      reportedGrossPnl: overrides.reportedGrossPnl,
      riskAmountOverride: input.riskAmountOverride !== null && scale !== 1 ? Math.round(input.riskAmountOverride * scale * 100) / 100 : input.riskAmountOverride,
      mfePrice: input.mfePrice,
      maePrice: input.maePrice,
      strategyId: input.strategyId ?? null,
      setup: input.setup,
      timeframe: input.timeframe,
      tradeType: input.tradeType,
      entryModel: input.entryModel,
      confluences: input.confluences,
      marketCondition: input.marketCondition,
      grade: input.grade ?? null,
      notes: input.notes,
    },
  };
}

function revalidateTrades() {
  revalidatePath("/", "layout");
}

export const createTrade = createAction(tradeSchema, async (input, user) => {
  await assertOwnership(user.id, input);
  const instrument = await resolveInstrument(user.id, input.symbol, input.pointValue);
  const pointValue = input.pointValue ?? num(instrument.pointValue);

  const targets = [
    { accountId: input.accountId, quantity: input.quantity, commission: input.commission, swap: input.swap, reportedGrossPnl: input.reportedGrossPnl },
    ...input.copies.map((c) => ({
      accountId: c.accountId,
      quantity: c.quantity ?? input.quantity,
      commission: c.commission ?? input.commission,
      swap: c.swap ?? input.swap,
      reportedGrossPnl: c.reportedGrossPnl ?? (c.quantity == null ? input.reportedGrossPnl : null),
    })),
  ];

  for (const t of targets) {
    const risk = computeTrade({ ...input, quantity: t.quantity, pointValue, exits: [] }).initialRisk;
    await checkHardLimits(user.id, t.accountId, { openedAt: input.openedAt, quantity: t.quantity, risk });
  }

  const built = targets.map((t) => tradeData(input, t, pointValue));
  const dup = await prisma.trade.findFirst({ where: { userId: user.id, fingerprint: { in: built.map((b) => b.fingerprint) } }, select: { id: true } });
  if (dup) throw new UserError("An identical trade already exists on this account.");

  const ids = await prisma.$transaction(async (tx) => {
    const group = targets.length > 1 ? await tx.tradeGroup.create({ data: { userId: user.id, label: `${input.symbol} ${input.direction.toLowerCase()}` } }) : null;
    const created: string[] = [];
    for (const b of built) {
      const trade = await tx.trade.create({
        data: {
          ...b.data,
          userId: user.id,
          instrumentId: instrument.id,
          groupId: group?.id ?? null,
          source: "MANUAL",
          fingerprint: b.fingerprint,
          exits: { create: b.exits },
          tags: { create: input.tagIds.map((tagId) => ({ tagId })) },
          journal: input.journal ? { create: input.journal } : undefined,
        },
      });
      created.push(trade.id);
    }
    return created;
  });
  for (const t of targets) await rebuildAccount(user.id, t.accountId);
  revalidateTrades();
  return { id: ids[0], ids };
});

export const updateTrade = createAction(tradeSchema.safeExtend({ id }), async (input, user) => {
  const existing = await prisma.trade.findFirst({ where: { id: input.id, userId: user.id } });
  if (!existing) throw new UserError("Trade not found");
  await assertOwnership(user.id, { ...input, copies: [] });
  const instrument = await resolveInstrument(user.id, input.symbol, input.pointValue);
  const pointValue = input.pointValue ?? (existing.symbol === input.symbol ? num(existing.pointValue) : num(instrument.pointValue));
  const b = tradeData(input, { accountId: input.accountId, quantity: input.quantity, commission: input.commission, swap: input.swap, reportedGrossPnl: input.reportedGrossPnl }, pointValue);
  await prisma.$transaction([
    prisma.tradeExit.deleteMany({ where: { tradeId: existing.id } }),
    prisma.tradeTagAssignment.deleteMany({ where: { tradeId: existing.id } }),
    prisma.trade.update({
      where: { id: existing.id },
      data: {
        ...b.data,
        instrumentId: instrument.id,
        fingerprint: b.fingerprint,
        exits: { create: b.exits },
        tags: { create: input.tagIds.map((tagId) => ({ tagId })) },
        ...(input.journal ? { journal: { upsert: { create: input.journal, update: input.journal } } } : {}),
      },
    }),
  ]);
  await rebuildAccount(user.id, input.accountId);
  if (existing.accountId !== input.accountId) await rebuildAccount(user.id, existing.accountId);
  revalidateTrades();
  return { id: existing.id };
});

export const deleteTrades = createAction(z.object({ ids: z.array(id).min(1).max(500) }), async ({ ids }, user) => {
  const trades = await prisma.trade.findMany({ where: { id: { in: ids }, userId: user.id }, select: { id: true, accountId: true, groupId: true } });
  if (!trades.length) throw new UserError("Trade not found");
  const shots = await prisma.tradeScreenshot.findMany({ where: { userId: user.id, tradeId: { in: trades.map((t) => t.id) } }, select: { storageKey: true } });
  await prisma.trade.deleteMany({ where: { id: { in: trades.map((t) => t.id) }, userId: user.id } });
  // Screenshot rows cascade with the trade; remove the stored files too.
  const storage = getStorage();
  await Promise.all(shots.map((s) => storage.delete(s.storageKey).catch((e) => console.error("[screenshot delete]", e))));
  await pruneGroups(user.id, trades.map((t) => t.groupId));
  for (const accountId of new Set(trades.map((t) => t.accountId))) await rebuildAccount(user.id, accountId);
  revalidateTrades();
  return { deleted: trades.length };
});

export const saveTradeJournal = createAction(
  z.object({ tradeId: id, journal: journalSchema, tagIds: z.array(id).max(30).optional(), notes: z.string().max(10000).optional().nullable() }),
  async ({ tradeId, journal, tagIds, notes }, user) => {
    const trade = await prisma.trade.findFirst({ where: { id: tradeId, userId: user.id } });
    if (!trade) throw new UserError("Trade not found");
    if (tagIds && tagIds.length && (await prisma.tradeTag.count({ where: { userId: user.id, id: { in: tagIds } } })) !== new Set(tagIds).size)
      throw new UserError("Tag not found");
    await prisma.$transaction([
      prisma.tradeJournal.upsert({ where: { tradeId }, create: { ...journal, tradeId }, update: journal }),
      ...(tagIds
        ? [prisma.tradeTagAssignment.deleteMany({ where: { tradeId } }), prisma.tradeTagAssignment.createMany({ data: tagIds.map((tagId) => ({ tradeId, tagId })) })]
        : []),
      ...(notes !== undefined ? [prisma.trade.update({ where: { id: tradeId }, data: { notes: notes?.trim() || null } })] : []),
    ]);
    revalidatePath(`/trades/${tradeId}`);
    revalidatePath("/journal");
    return undefined;
  },
);

/** Dissolve copy groups left with fewer than two trades (a lone "copy" is just a trade). */
async function pruneGroups(userId: string, groupIds: (string | null)[]) {
  const ids = [...new Set(groupIds.filter((g): g is string => !!g))];
  if (ids.length) {
    const counts = await prisma.trade.groupBy({ by: ["groupId"], where: { userId, groupId: { in: ids } }, _count: { _all: true } });
    const lonely = counts.filter((c) => c._count._all < 2).map((c) => c.groupId!);
    if (lonely.length) await prisma.trade.updateMany({ where: { userId, groupId: { in: lonely } }, data: { groupId: null } });
  }
  await prisma.tradeGroup.deleteMany({ where: { userId, trades: { none: {} } } });
}

/** Link existing trades on different accounts as copies of the same idea (or unlink). */
export const setTradeGroup = createAction(z.object({ ids: z.array(id).min(1).max(20), link: z.boolean() }), async ({ ids, link }, user) => {
  const trades = await prisma.trade.findMany({ where: { id: { in: ids }, userId: user.id } });
  if (trades.length !== ids.length) throw new UserError("Trade not found");
  if (link) {
    if (trades.length < 2) throw new UserError("Select at least two trades to link");
    if (new Set(trades.map((t) => t.accountId)).size !== trades.length) throw new UserError("Linked copies must be on different accounts");
    const group = await prisma.tradeGroup.create({ data: { userId: user.id, label: `${trades[0].symbol} ${trades[0].direction.toLowerCase()}` } });
    await prisma.trade.updateMany({ where: { id: { in: ids }, userId: user.id }, data: { groupId: group.id } });
  } else {
    await prisma.trade.updateMany({ where: { id: { in: ids }, userId: user.id }, data: { groupId: null } });
  }
  await pruneGroups(user.id, trades.map((t) => t.groupId));
  revalidateTrades();
  return undefined;
});
