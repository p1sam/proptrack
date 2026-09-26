import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { EMOTIONS } from "@/lib/calc/behavior";
import { calculateExcursionR } from "@/lib/calc/trade";
import type { TradeFilters } from "@/lib/filters";
import { num, numOrNull } from "@/lib/num";
import { prisma } from "../db";
import { getPrefs, listAccountSummaries } from "./accounts";
import { statsOf } from "./analytics";
import { loadDataset } from "./dataset";
import { getFilterOptions } from "./options";
import { buildTradeWhere } from "./trade-where";

// ─── Trade table ────────────────────────────────────────────────────────────

export const TRADE_SORTS = ["date", "symbol", "pnl", "r", "risk", "account"] as const;
export type TradeSort = (typeof TRADE_SORTS)[number];
export type SortDir = "asc" | "desc";
export const TRADES_PAGE_SIZE = 50;

type SP = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export function parseTableParams(sp: SP) {
  const sortRaw = first(sp.sort);
  const sort: TradeSort = (TRADE_SORTS as readonly string[]).includes(sortRaw ?? "") ? (sortRaw as TradeSort) : "date";
  const dir: SortDir = first(sp.dir) === "asc" ? "asc" : "desc";
  const page = Math.max(1, Math.min(10_000, Math.floor(Number(first(sp.page)) || 1)));
  return { sort, dir, page };
}

function orderFor(sort: TradeSort, dir: SortDir): Prisma.TradeOrderByWithRelationInput[] {
  const tie: Prisma.TradeOrderByWithRelationInput[] = [{ openedAt: "desc" }, { id: "desc" }];
  switch (sort) {
    case "date":
      return [{ openedAt: dir }, { id: dir }];
    case "symbol":
      return [{ symbol: dir }, ...tie];
    case "pnl":
      return [{ netPnl: { sort: dir, nulls: "last" } }, ...tie];
    case "r":
      return [{ rMultiple: { sort: dir, nulls: "last" } }, ...tie];
    case "risk":
      return [{ riskPercent: { sort: dir, nulls: "last" } }, ...tie];
    case "account":
      return [{ account: { name: dir } }, ...tie];
  }
}

export async function listTrades(userId: string, filters: TradeFilters, opts: { page: number; sort: TradeSort; dir: SortDir }) {
  const prefs = await getPrefs(userId);
  const where = buildTradeWhere(userId, filters, { timezone: prefs.timezone, tolerance: prefs.breakevenTolerance });
  const total = await prisma.trade.count({ where });
  const pages = Math.max(1, Math.ceil(total / TRADES_PAGE_SIZE));
  const page = Math.min(opts.page, pages);
  const rows = await prisma.trade.findMany({
    where,
    orderBy: orderFor(opts.sort, opts.dir),
    skip: (page - 1) * TRADES_PAGE_SIZE,
    take: TRADES_PAGE_SIZE,
    select: {
      id: true,
      accountId: true,
      groupId: true,
      symbol: true,
      direction: true,
      status: true,
      openedAt: true,
      closedAt: true,
      quantity: true,
      entryPrice: true,
      exitPrice: true,
      stopLoss: true,
      netPnl: true,
      rMultiple: true,
      riskPercent: true,
      setup: true,
      grade: true,
      account: { select: { name: true, currency: true } },
      strategy: { select: { name: true } },
      session: { select: { name: true } },
      tags: { select: { tag: { select: { id: true, name: true, kind: true } } } },
    },
  });
  return {
    total,
    page,
    pages,
    prefs,
    rows: rows.map((t) => ({
      id: t.id,
      accountId: t.accountId,
      accountName: t.account.name,
      currency: t.account.currency,
      groupId: t.groupId,
      symbol: t.symbol,
      direction: t.direction,
      status: t.status,
      openedAt: t.openedAt.toISOString(),
      closedAt: t.closedAt?.toISOString() ?? null,
      quantity: num(t.quantity),
      entryPrice: num(t.entryPrice),
      exitPrice: numOrNull(t.exitPrice),
      stopLoss: numOrNull(t.stopLoss),
      netPnl: numOrNull(t.netPnl),
      rMultiple: numOrNull(t.rMultiple),
      riskPercent: numOrNull(t.riskPercent),
      strategy: t.strategy?.name ?? null,
      session: t.session?.name ?? null,
      setup: t.setup,
      grade: t.grade,
      tags: t.tags.map((x) => x.tag),
    })),
  };
}
export type TradeRow = Awaited<ReturnType<typeof listTrades>>["rows"][number];

/** Closed-trade stats for the filtered set, in the user's currency (copies collapsed for rates). */
export async function tradeSetSummary(userId: string, filters: TradeFilters) {
  const ds = await loadDataset(userId, filters);
  const s = statsOf(ds.trades, ds);
  return {
    currency: ds.currency,
    closedTrades: s.totalTrades,
    rawClosed: ds.rawCount,
    collapsed: ds.collapsed,
    netPnl: s.netProfit,
    winRate: s.winRate,
    averageR: s.averageR,
    tradesWithR: s.tradesWithR,
    profitFactor: s.profitFactor,
    excluded: ds.excluded,
  };
}

// ─── Trade form ─────────────────────────────────────────────────────────────

export async function getTradeFormOptions(userId: string) {
  const [opts, summaries, prefs] = await Promise.all([getFilterOptions(userId), listAccountSummaries(userId), getPrefs(userId)]);
  const byKind = (k: string) => opts.categories.filter((c) => c.kind === k).map((c) => c.name);
  return {
    timezone: prefs.timezone,
    accounts: summaries
      .filter((a) => a.status !== "ARCHIVED")
      .map((a) => ({ id: a.id, name: a.name, currency: a.currency, balance: a.balance, status: a.status, firm: a.firm?.name ?? null })),
    archivedAccounts: summaries.filter((a) => a.status === "ARCHIVED").map((a) => ({ id: a.id, name: a.name, currency: a.currency, balance: a.balance, status: a.status, firm: a.firm?.name ?? null })),
    instruments: opts.instruments.map((i) => ({ symbol: i.symbol, name: i.name, pointValue: i.pointValue, assetClass: i.assetClass })),
    strategies: opts.strategies.filter((s) => !s.isArchived).map((s) => ({ id: s.id, name: s.name })),
    tags: opts.tags.map((t) => ({ id: t.id, name: t.name, kind: t.kind, isDefault: t.isDefault })),
    categories: {
      setups: opts.setups,
      timeframes: byKind("TIMEFRAME"),
      tradeTypes: byKind("TRADE_TYPE"),
      entryModels: byKind("ENTRY_MODEL"),
      confluences: byKind("CONFLUENCE"),
      marketConditions: byKind("MARKET_CONDITION"),
    },
  };
}
export type TradeFormOptions = Awaited<ReturnType<typeof getTradeFormOptions>>;

// ─── Trade detail ───────────────────────────────────────────────────────────

const JOURNAL_TEXT = ["reason", "thesis", "setupExplanation", "expectedOutcome", "riskJustification", "whatHappened", "changes", "wentWell", "wentWrong", "lesson", "emotionalState", "mistakes"] as const;

function serializeJournal(j: Record<string, unknown> | null) {
  if (!j) return null;
  const out: Record<string, string | number | boolean | null> = { followedPlan: (j.followedPlan as boolean | null) ?? null };
  for (const k of JOURNAL_TEXT) out[k] = (j[k] as string | null) ?? null;
  for (const e of EMOTIONS) out[e] = (j[e] as number | null) ?? null;
  return out as JournalData;
}
export type JournalData = { [K in (typeof JOURNAL_TEXT)[number]]: string | null } & { [K in (typeof EMOTIONS)[number]]: number | null } & { followedPlan: boolean | null };

export async function getTradeDetail(userId: string, tradeId: string) {
  const t = await prisma.trade.findFirst({
    where: { id: tradeId, userId },
    include: {
      account: { select: { id: true, name: true, currency: true } },
      strategy: { select: { id: true, name: true } },
      session: { select: { id: true, name: true } },
      exits: { orderBy: { exitedAt: "asc" } },
      journal: true,
      tags: { select: { tag: { select: { id: true, name: true, kind: true } } } },
      screenshots: { orderBy: { createdAt: "asc" }, select: { id: true, phase: true, caption: true, size: true, mimeType: true, createdAt: true } },
      violations: { orderBy: { occurredAt: "asc" }, select: { id: true, message: true, severity: true, source: true, day: true, ruleKey: true } },
    },
  });
  if (!t) return null;
  const copies = t.groupId
    ? await prisma.trade.findMany({
        where: { userId, groupId: t.groupId, id: { not: t.id } },
        select: { id: true, netPnl: true, rMultiple: true, quantity: true, status: true, account: { select: { id: true, name: true, currency: true } } },
      })
    : [];
  const entry = num(t.entryPrice);
  const stop = numOrNull(t.stopLoss);
  const excursion = (price: number | null, kind: "MFE" | "MAE") => calculateExcursionR({ direction: t.direction, entryPrice: entry, stopLoss: stop, price, kind });
  const mfePrice = numOrNull(t.mfePrice);
  const maePrice = numOrNull(t.maePrice);
  return {
    id: t.id,
    account: t.account,
    groupId: t.groupId,
    symbol: t.symbol,
    direction: t.direction,
    status: t.status,
    source: t.source,
    openedAt: t.openedAt.toISOString(),
    closedAt: t.closedAt?.toISOString() ?? null,
    entryPrice: entry,
    exitPrice: numOrNull(t.exitPrice),
    stopLoss: stop,
    takeProfit: numOrNull(t.takeProfit),
    quantity: num(t.quantity),
    pointValue: num(t.pointValue),
    commission: num(t.commission),
    swap: num(t.swap),
    reportedGrossPnl: numOrNull(t.reportedGrossPnl),
    riskAmountOverride: numOrNull(t.riskAmountOverride),
    mfePrice,
    maePrice,
    mfeR: excursion(mfePrice, "MFE"),
    maeR: excursion(maePrice, "MAE"),
    grossPnl: numOrNull(t.grossPnl),
    netPnl: numOrNull(t.netPnl),
    initialRisk: numOrNull(t.initialRisk),
    riskPercent: numOrNull(t.riskPercent),
    rMultiple: numOrNull(t.rMultiple),
    plannedRR: numOrNull(t.plannedRR),
    balanceBefore: numOrNull(t.balanceBefore),
    tradingDay: t.tradingDay,
    strategy: t.strategy,
    session: t.session,
    setup: t.setup,
    timeframe: t.timeframe,
    tradeType: t.tradeType,
    entryModel: t.entryModel,
    confluences: t.confluences,
    marketCondition: t.marketCondition,
    grade: t.grade,
    notes: t.notes,
    exits: t.exits.map((e) => ({ id: e.id, price: num(e.price), quantity: num(e.quantity), exitedAt: e.exitedAt.toISOString() })),
    journal: serializeJournal(t.journal as unknown as Record<string, unknown> | null),
    tags: t.tags.map((x) => x.tag),
    screenshots: t.screenshots.map((s) => ({ ...s, createdAt: s.createdAt.toISOString() })),
    violations: t.violations,
    copies: copies.map((c) => ({ id: c.id, account: c.account, netPnl: numOrNull(c.netPnl), rMultiple: numOrNull(c.rMultiple), quantity: num(c.quantity), status: c.status })),
  };
}
export type TradeDetail = NonNullable<Awaited<ReturnType<typeof getTradeDetail>>>;

// ─── Journal ────────────────────────────────────────────────────────────────

/** A trade "has a journal" when it has notes or any journal field filled in. */
const HAS_JOURNAL: Prisma.TradeWhereInput = {
  OR: [
    { notes: { not: null } },
    {
      journal: {
        OR: [
          ...JOURNAL_TEXT.map((k) => ({ [k]: { not: null } })),
          ...EMOTIONS.map((e) => ({ [e]: { not: null } })),
          { followedPlan: { not: null } },
        ] as Prisma.TradeJournalWhereInput[],
      },
    },
  ],
};

export const JOURNAL_PAGE_SIZE = 20;

export async function listJournal(userId: string, filters: TradeFilters, page: number) {
  const prefs = await getPrefs(userId);
  const base = buildTradeWhere(userId, { ...filters, status: filters.status ?? "ALL" }, { timezone: prefs.timezone, tolerance: prefs.breakevenTolerance });
  const where: Prisma.TradeWhereInput = { AND: [base, HAS_JOURNAL] };
  const total = await prisma.trade.count({ where });
  const pages = Math.max(1, Math.ceil(total / JOURNAL_PAGE_SIZE));
  const p = Math.min(page, pages);
  const [rows, review, reviewCount] = await Promise.all([
    prisma.trade.findMany({
      where,
      orderBy: [{ openedAt: "desc" }, { id: "desc" }],
      skip: (p - 1) * JOURNAL_PAGE_SIZE,
      take: JOURNAL_PAGE_SIZE,
      select: {
        id: true,
        symbol: true,
        direction: true,
        status: true,
        openedAt: true,
        closedAt: true,
        netPnl: true,
        rMultiple: true,
        groupId: true,
        notes: true,
        grade: true,
        account: { select: { name: true, currency: true } },
        strategy: { select: { name: true } },
        journal: true,
        tags: { select: { tag: { select: { id: true, name: true, kind: true } } } },
      },
    }),
    prisma.trade.findMany({
      where: { AND: [buildTradeWhere(userId, { ...filters, status: "CLOSED" }, { timezone: prefs.timezone, tolerance: prefs.breakevenTolerance }), { NOT: HAS_JOURNAL }] },
      orderBy: [{ closedAt: "desc" }, { id: "desc" }],
      take: 8,
      select: { id: true, symbol: true, direction: true, closedAt: true, netPnl: true, rMultiple: true, account: { select: { name: true, currency: true } } },
    }),
    prisma.trade.count({ where: { AND: [buildTradeWhere(userId, { ...filters, status: "CLOSED" }, { timezone: prefs.timezone, tolerance: prefs.breakevenTolerance }), { NOT: HAS_JOURNAL }] } }),
  ]);
  return {
    prefs,
    total,
    page: p,
    pages,
    entries: rows.map((t) => ({
      id: t.id,
      symbol: t.symbol,
      direction: t.direction,
      status: t.status,
      openedAt: t.openedAt.toISOString(),
      closedAt: t.closedAt?.toISOString() ?? null,
      netPnl: numOrNull(t.netPnl),
      rMultiple: numOrNull(t.rMultiple),
      copied: !!t.groupId,
      notes: t.notes,
      grade: t.grade,
      account: t.account.name,
      currency: t.account.currency,
      strategy: t.strategy?.name ?? null,
      journal: serializeJournal(t.journal as unknown as Record<string, unknown> | null),
      tags: t.tags.map((x) => x.tag),
    })),
    review: review.map((t) => ({
      id: t.id,
      symbol: t.symbol,
      direction: t.direction,
      closedAt: t.closedAt?.toISOString() ?? null,
      netPnl: numOrNull(t.netPnl),
      rMultiple: numOrNull(t.rMultiple),
      account: t.account.name,
      currency: t.account.currency,
    })),
    reviewCount,
  };
}
