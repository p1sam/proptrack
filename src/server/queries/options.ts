import "server-only";
import { cache } from "react";
import { prisma } from "../db";

/** Option lists for filters and forms, all scoped to the user. */
export const getFilterOptions = cache(async (userId: string) => {
  const [accounts, firms, strategies, symbols, sessions, tags, setups, categories, instruments] = await Promise.all([
    prisma.tradingAccount.findMany({ where: { userId }, select: { id: true, name: true, status: true, currency: true, propFirmId: true }, orderBy: { createdAt: "desc" } }),
    prisma.propFirm.findMany({ where: { userId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.strategy.findMany({ where: { userId }, select: { id: true, name: true, isArchived: true }, orderBy: { name: "asc" } }),
    prisma.trade.findMany({ where: { userId }, distinct: ["symbol"], select: { symbol: true }, orderBy: { symbol: "asc" } }),
    prisma.tradingSession.findMany({ where: { userId }, select: { id: true, name: true, isActive: true }, orderBy: { priority: "asc" } }),
    prisma.tradeTag.findMany({ where: { userId }, select: { id: true, name: true, kind: true, color: true, isDefault: true }, orderBy: { name: "asc" } }),
    prisma.trade.findMany({ where: { userId, setup: { not: null } }, distinct: ["setup"], select: { setup: true } }),
    prisma.category.findMany({ where: { userId }, select: { id: true, kind: true, name: true }, orderBy: { name: "asc" } }),
    prisma.instrument.findMany({ where: { userId }, select: { id: true, symbol: true, name: true, pointValue: true, assetClass: true }, orderBy: { symbol: "asc" } }),
  ]);
  const setupNames = new Set([...setups.map((s) => s.setup!), ...categories.filter((c) => c.kind === "SETUP").map((c) => c.name)]);
  return {
    accounts,
    firms,
    strategies,
    symbols: [...new Set([...symbols.map((s) => s.symbol), ...instruments.map((i) => i.symbol)])].sort(),
    sessions,
    tags,
    setups: [...setupNames].sort(),
    categories,
    instruments: instruments.map((i) => ({ ...i, pointValue: Number(i.pointValue) })),
  };
});
export type FilterOptions = Awaited<ReturnType<typeof getFilterOptions>>;
