"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { isAPIError } from "better-auth/api";
import { DEFAULT_SESSIONS } from "@/lib/calc/sessions";
import { num } from "@/lib/num";
import {
  categorySchema,
  exchangeRateSchema,
  idSchema,
  instrumentSchema,
  passwordSchema,
  preferencesSchema,
  profileSchema,
  sessionSchema,
  strategySchema,
  tagSchema,
} from "@/lib/validation/settings";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "../db";
import { auth } from "../auth";
import { createAction, UserError } from "../action";
import { enforceRateLimit } from "../rate-limit";
import { rebuildAllAccounts } from "../services/rebuild";

/**
 * Settings mutations. Every write is scoped by user.id; unique-name conflicts are reported as
 * friendly errors. Changes that affect derived trade columns (timezone, break-even tolerance,
 * sessions) rebuild every account so trading days, sessions and weekdays stay consistent.
 */

function refresh() {
  revalidatePath("/", "layout");
}

/** Map a Prisma unique violation to a readable message; rethrow anything else. */
async function uniqueGuard<T>(fn: () => Promise<T>, message: string): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new UserError(message);
    throw e;
  }
}

async function rebuildAll(userId: string) {
  const count = await prisma.tradingAccount.count({ where: { userId } });
  await rebuildAllAccounts(userId);
  return count;
}

// ─── Profile ────────────────────────────────────────────────────────────────

export const updateProfile = createAction(profileSchema, async ({ name }, user) => {
  await prisma.user.update({ where: { id: user.id }, data: { name } });
  refresh();
  return undefined;
});

export const changePassword = createAction(passwordSchema, async (input, user) => {
  await enforceRateLimit(`settings:password:${user.id}`, { window: 600, max: 5 });
  try {
    await auth.api.changePassword({
      body: { currentPassword: input.currentPassword, newPassword: input.newPassword, revokeOtherSessions: true },
      headers: await headers(),
    });
  } catch (e) {
    if (isAPIError(e)) {
      const msg = String(e.body?.message ?? e.message ?? "");
      if (/invalid password|incorrect/i.test(msg)) throw new UserError("Current password is incorrect");
      throw new UserError(msg || "Could not change password");
    }
    throw e;
  }
  return undefined;
});

export const signOutOtherSessions = createAction(z.object({}), async (_input, user) => {
  const before = await prisma.session.count({ where: { userId: user.id } });
  await auth.api.revokeOtherSessions({ headers: await headers() });
  const after = await prisma.session.count({ where: { userId: user.id } });
  return { revoked: Math.max(0, before - after) };
});

// ─── Preferences ────────────────────────────────────────────────────────────

export const savePreferences = createAction(preferencesSchema, async (input, user) => {
  const prev = await prisma.userSettings.findUnique({ where: { userId: user.id } });
  const data = {
    defaultCurrency: input.defaultCurrency,
    timezone: input.timezone,
    riskPercent: input.riskPercent,
    maxTradesPerDay: input.maxTradesPerDay,
    maxDailyLossPct: input.maxDailyLossPct,
    defaultRR: input.defaultRR,
    breakevenTolerance: input.breakevenTolerance,
    insightMinTrades: input.insightMinTrades,
  };
  await prisma.userSettings.upsert({ where: { userId: user.id }, update: data, create: { ...data, userId: user.id } });
  const needsRebuild = !prev || prev.timezone !== input.timezone || num(prev.breakevenTolerance) !== input.breakevenTolerance;
  const rebuilt = needsRebuild ? await rebuildAll(user.id) : 0;
  refresh();
  return { rebuilt: needsRebuild, accounts: rebuilt };
});

// ─── Sessions ───────────────────────────────────────────────────────────────

export const saveSession = createAction(sessionSchema, async (input, user) => {
  const data = {
    name: input.name,
    timezone: input.timezone,
    startMinute: input.start,
    endMinute: input.end,
    priority: input.priority,
    color: input.color,
    isActive: input.isActive,
  };
  const conflict = await prisma.tradingSession.findFirst({ where: { userId: user.id, name: { equals: input.name, mode: "insensitive" }, ...(input.id ? { id: { not: input.id } } : {}) } });
  if (conflict) throw new UserError(`A session named "${conflict.name}" already exists`);
  await uniqueGuard(async () => {
    if (input.id) {
      const r = await prisma.tradingSession.updateMany({ where: { id: input.id, userId: user.id }, data });
      if (!r.count) throw new UserError("Session not found");
    } else {
      await prisma.tradingSession.create({ data: { ...data, userId: user.id } });
    }
  }, "A session with that name already exists");
  const accounts = await rebuildAll(user.id);
  refresh();
  return { accounts };
});

export const deleteSession = createAction(idSchema, async ({ id }, user) => {
  const r = await prisma.tradingSession.deleteMany({ where: { id, userId: user.id } });
  if (!r.count) throw new UserError("Session not found");
  const accounts = await rebuildAll(user.id);
  refresh();
  return { accounts };
});

export const restoreDefaultSessions = createAction(z.object({}), async (_input, user) => {
  await prisma.$transaction(
    DEFAULT_SESSIONS.map((s) =>
      prisma.tradingSession.upsert({
        where: { userId_name: { userId: user.id, name: s.name } },
        update: { timezone: s.timezone, startMinute: s.startMinute, endMinute: s.endMinute, priority: s.priority, isActive: true, color: null },
        create: { userId: user.id, name: s.name, timezone: s.timezone, startMinute: s.startMinute, endMinute: s.endMinute, priority: s.priority },
      }),
    ),
  );
  const accounts = await rebuildAll(user.id);
  refresh();
  return { accounts };
});

// ─── Strategies ─────────────────────────────────────────────────────────────

export const saveStrategy = createAction(strategySchema, async (input, user) => {
  const conflict = await prisma.strategy.findFirst({ where: { userId: user.id, name: { equals: input.name, mode: "insensitive" }, ...(input.id ? { id: { not: input.id } } : {}) } });
  if (conflict) throw new UserError(`A strategy named "${conflict.name}" already exists`);
  const data = { name: input.name, description: input.description, color: input.color, isArchived: input.isArchived };
  await uniqueGuard(async () => {
    if (input.id) {
      const r = await prisma.strategy.updateMany({ where: { id: input.id, userId: user.id }, data });
      if (!r.count) throw new UserError("Strategy not found");
    } else await prisma.strategy.create({ data: { ...data, userId: user.id } });
  }, "A strategy with that name already exists");
  refresh();
  return undefined;
});

export const setStrategyArchived = createAction(z.object({ id: idSchema.shape.id, archived: z.boolean() }), async ({ id, archived }, user) => {
  const r = await prisma.strategy.updateMany({ where: { id, userId: user.id }, data: { isArchived: archived } });
  if (!r.count) throw new UserError("Strategy not found");
  refresh();
  return undefined;
});

/** Trades keep existing; their strategy is cleared (FK onDelete: SetNull). */
export const deleteStrategy = createAction(idSchema, async ({ id }, user) => {
  const r = await prisma.strategy.deleteMany({ where: { id, userId: user.id } });
  if (!r.count) throw new UserError("Strategy not found");
  refresh();
  return undefined;
});

// ─── Instruments ────────────────────────────────────────────────────────────

export const saveInstrument = createAction(instrumentSchema, async (input, user) => {
  const conflict = await prisma.instrument.findFirst({ where: { userId: user.id, symbol: input.symbol, ...(input.id ? { id: { not: input.id } } : {}) } });
  if (conflict) throw new UserError(`${input.symbol} already exists`);
  const data = { symbol: input.symbol, name: input.name, assetClass: input.assetClass, pointValue: input.pointValue, tickSize: input.tickSize };
  await uniqueGuard(async () => {
    if (input.id) {
      const existing = await prisma.instrument.findFirst({ where: { id: input.id, userId: user.id }, include: { _count: { select: { trades: true } } } });
      if (!existing) throw new UserError("Instrument not found");
      // Trades snapshot pointValue at entry, so editing it never rewrites history. The symbol is
      // part of each trade's text and import fingerprint, so it is frozen once trades use it.
      if (existing.symbol !== input.symbol && existing._count.trades > 0) {
        throw new UserError(`${existing.symbol} is used by ${existing._count.trades} trades, so its symbol can't change. Add a new instrument instead.`);
      }
      await prisma.instrument.update({ where: { id: input.id }, data });
    } else await prisma.instrument.create({ data: { ...data, userId: user.id } });
  }, "An instrument with that symbol already exists");
  refresh();
  return undefined;
});

export const deleteInstrument = createAction(idSchema, async ({ id }, user) => {
  const inst = await prisma.instrument.findFirst({ where: { id, userId: user.id }, include: { _count: { select: { trades: true } } } });
  if (!inst) throw new UserError("Instrument not found");
  if (inst._count.trades > 0) throw new UserError(`${inst.symbol} is used by ${inst._count.trades} trade${inst._count.trades === 1 ? "" : "s"} and can't be deleted`);
  await prisma.instrument.delete({ where: { id: inst.id } });
  refresh();
  return undefined;
});

// ─── Tags ───────────────────────────────────────────────────────────────────

export const saveTag = createAction(tagSchema, async (input, user) => {
  const conflict = await prisma.tradeTag.findFirst({ where: { userId: user.id, name: { equals: input.name, mode: "insensitive" }, ...(input.id ? { id: { not: input.id } } : {}) } });
  if (conflict) throw new UserError(`A tag named "${conflict.name}" already exists`);
  const data = { name: input.name, kind: input.kind, color: input.color, isDefault: input.isDefault };
  await uniqueGuard(async () => {
    if (input.id) {
      const r = await prisma.tradeTag.updateMany({ where: { id: input.id, userId: user.id }, data });
      if (!r.count) throw new UserError("Tag not found");
    } else await prisma.tradeTag.create({ data: { ...data, userId: user.id } });
  }, "A tag with that name already exists");
  refresh();
  return undefined;
});

/** Removes the tag from every trade (assignments cascade). */
export const deleteTag = createAction(idSchema, async ({ id }, user) => {
  const r = await prisma.tradeTag.deleteMany({ where: { id, userId: user.id } });
  if (!r.count) throw new UserError("Tag not found");
  refresh();
  return undefined;
});

// ─── Categories ─────────────────────────────────────────────────────────────

export const saveCategory = createAction(categorySchema, async (input, user) => {
  const conflict = await prisma.category.findFirst({
    where: { userId: user.id, kind: input.kind, name: { equals: input.name, mode: "insensitive" }, ...(input.id ? { id: { not: input.id } } : {}) },
  });
  if (conflict) throw new UserError(`"${conflict.name}" already exists in this list`);
  await uniqueGuard(async () => {
    if (input.id) {
      const r = await prisma.category.updateMany({ where: { id: input.id, userId: user.id }, data: { name: input.name, kind: input.kind } });
      if (!r.count) throw new UserError("Option not found");
    } else await prisma.category.create({ data: { userId: user.id, kind: input.kind, name: input.name } });
  }, "That option already exists");
  refresh();
  return undefined;
});

/** Trades store the option as text, so deleting it only removes it from pickers. */
export const deleteCategory = createAction(idSchema, async ({ id }, user) => {
  const r = await prisma.category.deleteMany({ where: { id, userId: user.id } });
  if (!r.count) throw new UserError("Option not found");
  refresh();
  return undefined;
});

// ─── Exchange rates ─────────────────────────────────────────────────────────

export const saveExchangeRate = createAction(exchangeRateSchema, async (input, user) => {
  const conflict = await prisma.exchangeRate.findFirst({
    where: {
      userId: user.id,
      ...(input.id ? { id: { not: input.id } } : {}),
      OR: [
        { base: input.base, quote: input.quote },
        { base: input.quote, quote: input.base },
      ],
    },
  });
  if (conflict) throw new UserError(`A rate for ${conflict.base}/${conflict.quote} already exists — edit it instead`);
  await uniqueGuard(async () => {
    if (input.id) {
      const r = await prisma.exchangeRate.updateMany({ where: { id: input.id, userId: user.id }, data: { base: input.base, quote: input.quote, rate: input.rate } });
      if (!r.count) throw new UserError("Rate not found");
    } else await prisma.exchangeRate.create({ data: { userId: user.id, base: input.base, quote: input.quote, rate: input.rate } });
  }, "That currency pair already has a rate");
  refresh();
  return undefined;
});

export const deleteExchangeRate = createAction(idSchema, async ({ id }, user) => {
  const r = await prisma.exchangeRate.deleteMany({ where: { id, userId: user.id } });
  if (!r.count) throw new UserError("Rate not found");
  refresh();
  return undefined;
});
