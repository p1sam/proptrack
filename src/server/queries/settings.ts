import "server-only";
import { headers } from "next/headers";
import { prisma } from "../db";
import { auth } from "../auth";
import { num, numOrNull } from "@/lib/num";
import { Prisma } from "@/generated/prisma/client";
import type { CategoryKind } from "@/generated/prisma/enums";
import { currenciesMissingRate } from "@/components/settings/logic";

/**
 * Read models for the Settings page. Every query takes userId first and scopes by it. Each tab
 * loads only what it shows.
 */

export async function getUserPrefs(userId: string) {
  const s = await prisma.userSettings.findUnique({ where: { userId } });
  return {
    defaultCurrency: s?.defaultCurrency ?? "USD",
    timezone: s?.timezone ?? "UTC",
    riskPercent: numOrNull(s?.riskPercent),
    maxTradesPerDay: s?.maxTradesPerDay ?? null,
    maxDailyLossPct: numOrNull(s?.maxDailyLossPct),
    defaultRR: numOrNull(s?.defaultRR),
    breakevenTolerance: s ? num(s.breakevenTolerance) : 0,
    insightMinTrades: s?.insightMinTrades ?? 20,
  };
}
export type UserPrefs = Awaited<ReturnType<typeof getUserPrefs>>;

/** Profile tab: the user plus how many *other* live sessions (browsers/devices) they have. */
export async function getProfileTab(userId: string) {
  const current = await auth.api.getSession({ headers: await headers() });
  const currentSessionId = current?.session.id ?? null;
  const [user, otherSessions] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true, email: true, createdAt: true } }),
    prisma.session.count({ where: { userId, expiresAt: { gt: new Date() }, ...(currentSessionId ? { id: { not: currentSessionId } } : {}) } }),
  ]);
  return { user, otherSessions };
}

export async function getPreferencesTab(userId: string) {
  const [prefs, accounts, trades] = await Promise.all([
    getUserPrefs(userId),
    prisma.tradingAccount.count({ where: { userId } }),
    prisma.trade.count({ where: { userId } }),
  ]);
  return { prefs, accounts, trades };
}

export async function getSessionsTab(userId: string) {
  const [prefs, sessions] = await Promise.all([
    getUserPrefs(userId),
    prisma.tradingSession.findMany({ where: { userId }, orderBy: [{ priority: "asc" }, { name: "asc" }], include: { _count: { select: { trades: true } } } }),
  ]);
  return {
    timezone: prefs.timezone,
    sessions: sessions.map((s) => ({
      id: s.id,
      name: s.name,
      timezone: s.timezone,
      startMinute: s.startMinute,
      endMinute: s.endMinute,
      priority: s.priority,
      color: s.color,
      isActive: s.isActive,
      trades: s._count.trades,
    })),
  };
}
export type SessionRow = Awaited<ReturnType<typeof getSessionsTab>>["sessions"][number];

export async function getStrategiesTab(userId: string) {
  const rows = await prisma.strategy.findMany({ where: { userId }, orderBy: [{ isArchived: "asc" }, { name: "asc" }], include: { _count: { select: { trades: true } } } });
  return rows.map((s) => ({ id: s.id, name: s.name, description: s.description, color: s.color, isArchived: s.isArchived, trades: s._count.trades }));
}
export type StrategyRow = Awaited<ReturnType<typeof getStrategiesTab>>[number];

export async function getInstrumentsTab(userId: string) {
  const rows = await prisma.instrument.findMany({ where: { userId }, orderBy: { symbol: "asc" }, include: { _count: { select: { trades: true } } } });
  return rows.map((i) => ({ id: i.id, symbol: i.symbol, name: i.name, assetClass: i.assetClass, pointValue: num(i.pointValue), tickSize: numOrNull(i.tickSize), trades: i._count.trades }));
}
export type InstrumentRow = Awaited<ReturnType<typeof getInstrumentsTab>>[number];

const CATEGORY_COLUMN: Record<Exclude<CategoryKind, "CONFLUENCE">, "setup" | "timeframe" | "tradeType" | "entryModel" | "marketCondition"> = {
  SETUP: "setup",
  TIMEFRAME: "timeframe",
  TRADE_TYPE: "tradeType",
  ENTRY_MODEL: "entryModel",
  MARKET_CONDITION: "marketCondition",
};

/** How many trades use each option text, per category kind. */
async function categoryUsage(userId: string): Promise<Map<string, number>> {
  const usage = new Map<string, number>();
  const scalar = await Promise.all(
    (Object.entries(CATEGORY_COLUMN) as [CategoryKind, (typeof CATEGORY_COLUMN)[keyof typeof CATEGORY_COLUMN]][]).map(async ([kind, col]) => {
      const rows = await prisma.trade.groupBy({ by: [col], where: { userId, [col]: { not: null } }, _count: { _all: true } });
      return rows.map((r) => [`${kind}|${(r as Record<string, unknown>)[col] as string}`, r._count._all] as const);
    }),
  );
  for (const rows of scalar) for (const [k, n] of rows) usage.set(k, n);
  const conf = await prisma.$queryRaw<{ name: string; n: bigint }[]>(
    Prisma.sql`SELECT c AS name, COUNT(*) AS n FROM trades t, unnest(t.confluences) AS c WHERE t."userId" = ${userId} GROUP BY c`,
  );
  for (const r of conf) usage.set(`CONFLUENCE|${r.name}`, Number(r.n));
  return usage;
}

export async function getTagsTab(userId: string) {
  const [tags, categories, usage] = await Promise.all([
    prisma.tradeTag.findMany({ where: { userId }, orderBy: [{ kind: "asc" }, { name: "asc" }], include: { _count: { select: { assignments: true } } } }),
    prisma.category.findMany({ where: { userId }, orderBy: { name: "asc" } }),
    categoryUsage(userId),
  ]);
  return {
    tags: tags.map((t) => ({ id: t.id, name: t.name, kind: t.kind, color: t.color, isDefault: t.isDefault, trades: t._count.assignments })),
    categories: categories.map((c) => ({ id: c.id, kind: c.kind, name: c.name, trades: usage.get(`${c.kind}|${c.name}`) ?? 0 })),
  };
}
export type TagRow = Awaited<ReturnType<typeof getTagsTab>>["tags"][number];
export type CategoryRow = Awaited<ReturnType<typeof getTagsTab>>["categories"][number];

export async function getPropFirmsTab(userId: string) {
  const firms = await prisma.propFirm.findMany({ where: { userId }, orderBy: { name: "asc" }, include: { _count: { select: { accounts: true } } } });
  return firms.map((f) => ({ id: f.id, name: f.name, website: f.website, hasTemplate: f.ruleTemplate !== null, accounts: f._count.accounts }));
}

export async function getCurrenciesTab(userId: string) {
  const [prefs, rates, accounts] = await Promise.all([
    getUserPrefs(userId),
    prisma.exchangeRate.findMany({ where: { userId }, orderBy: [{ base: "asc" }, { quote: "asc" }] }),
    prisma.tradingAccount.groupBy({ by: ["currency"], where: { userId }, _count: { _all: true } }),
  ]);
  const rateRows = rates.map((r) => ({ id: r.id, base: r.base, quote: r.quote, rate: num(r.rate), updatedAt: r.updatedAt }));
  const accountCurrencies = accounts.map((a) => ({ currency: a.currency.toUpperCase(), accounts: a._count._all })).sort((a, b) => a.currency.localeCompare(b.currency));
  const missing = currenciesMissingRate(
    accountCurrencies.map((a) => a.currency),
    prefs.defaultCurrency,
    rateRows,
  );
  return { defaultCurrency: prefs.defaultCurrency, timezone: prefs.timezone, rates: rateRows, accountCurrencies, missing };
}
export type RateRow = Awaited<ReturnType<typeof getCurrenciesTab>>["rates"][number];
