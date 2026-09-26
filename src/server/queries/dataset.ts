import "server-only";
import { cache } from "react";
import { collapseCopies } from "@/lib/calc/copies";
import type { BehaviorTrade, Emotion } from "@/lib/calc/behavior";
import { EMOTIONS } from "@/lib/calc/behavior";
import { convertAmount } from "@/lib/calc/fx";
import { dayKey, minuteOfDay } from "@/lib/calc/time";
import type { TradeFilters } from "@/lib/filters";
import { num, numOrNull } from "@/lib/num";
import { prisma } from "../db";
import { getFxTable, getPrefs } from "./accounts";
import { buildTradeWhere } from "./trade-where";

/**
 * The analytics dataset: closed trades matching the filters, with money converted to the user's
 * display currency and classification labels resolved. This is the single input to every
 * analytics surface (dashboard, analytics, strategies, calendar, reports, risk) — and the shape a
 * future AI layer would consume, so answers are always grounded in the same numbers the UI shows.
 */
export interface AnalysisTrade extends BehaviorTrade {
  accountId: string;
  accountName: string;
  firmId: string | null;
  firmName: string | null;
  groupId: string | null;
  symbol: string;
  direction: "LONG" | "SHORT";
  quantity: number;
  grossPnl: number;
  commission: number;
  swap: number;
  strategyId: string | null;
  strategyName: string | null;
  sessionId: string | null;
  sessionName: string | null;
  setup: string | null;
  timeframe: string | null;
  grade: string | null;
  weekday: number;
  hour: number;
  /** Close day in the user's timezone (calendar bucketing). */
  closeDay: string;
  tagIds: string[];
  mfePrice: number | null;
  maePrice: number | null;
  plannedRR: number | null;
  copies: number;
  memberIds: string[];
}

export interface Dataset {
  trades: AnalysisTrade[];
  /** Trades before copy-collapsing (money-level views). */
  rawCount: number;
  collapsed: boolean;
  currency: string;
  excluded: { count: number; currencies: string[] };
  startingCapital: number;
  timezone: string;
  breakevenTolerance: number;
  insightMinTrades: number;
  maxTradesPerDay: number | null;
}

export const loadDataset = cache(async (userId: string, filters: TradeFilters, opts: { collapse?: boolean } = {}): Promise<Dataset> => {
  const prefs = await getPrefs(userId);
  const fx = await getFxTable(userId);
  const where = buildTradeWhere(userId, { ...filters, status: "CLOSED" }, { timezone: prefs.timezone, tolerance: prefs.breakevenTolerance });
  const rows = await prisma.trade.findMany({
    where,
    orderBy: { closedAt: "asc" },
    select: {
      id: true,
      accountId: true,
      groupId: true,
      symbol: true,
      direction: true,
      quantity: true,
      openedAt: true,
      closedAt: true,
      grossPnl: true,
      netPnl: true,
      commission: true,
      swap: true,
      rMultiple: true,
      riskPercent: true,
      initialRisk: true,
      plannedRR: true,
      mfePrice: true,
      maePrice: true,
      strategyId: true,
      sessionId: true,
      setup: true,
      timeframe: true,
      grade: true,
      strategy: { select: { name: true } },
      session: { select: { name: true } },
      account: { select: { name: true, currency: true, startingBalance: true, propFirm: { select: { id: true, name: true } } } },
      tags: { select: { tag: { select: { id: true, name: true } } } },
      journal: { select: { followedPlan: true, ...Object.fromEntries(EMOTIONS.map((e) => [e, true])) } as Record<string, true> },
    },
  });

  const excludedCurrencies = new Set<string>();
  let excludedCount = 0;
  const capitalByAccount = new Map<string, number>();
  const trades: AnalysisTrade[] = [];
  for (const t of rows) {
    if (!t.closedAt || t.netPnl === null) continue;
    const ccy = t.account.currency;
    const conv = (v: number) => convertAmount(v, ccy, prefs.currency, fx);
    const net = conv(num(t.netPnl));
    if (net === null) {
      excludedCount++;
      excludedCurrencies.add(ccy);
      continue;
    }
    if (!capitalByAccount.has(t.accountId)) capitalByAccount.set(t.accountId, conv(num(t.account.startingBalance)) ?? 0);
    const journal = t.journal as (Record<string, number | boolean | null> & { followedPlan: boolean | null }) | null;
    const emotions: Partial<Record<Emotion, number | null>> = {};
    if (journal) for (const e of EMOTIONS) emotions[e] = (journal[e] as number | null) ?? null;
    trades.push({
      id: t.id,
      accountId: t.accountId,
      accountName: t.account.name,
      firmId: t.account.propFirm?.id ?? null,
      firmName: t.account.propFirm?.name ?? null,
      groupId: t.groupId,
      symbol: t.symbol,
      direction: t.direction,
      quantity: num(t.quantity),
      openedAt: t.openedAt,
      closedAt: t.closedAt,
      day: dayKey(t.openedAt, prefs.timezone),
      closeDay: dayKey(t.closedAt, prefs.timezone),
      weekday: new Date(`${dayKey(t.openedAt, prefs.timezone)}T00:00:00Z`).getUTCDay(),
      hour: Math.floor(minuteOfDay(t.openedAt, prefs.timezone) / 60),
      netPnl: net,
      grossPnl: conv(num(t.grossPnl)) ?? 0,
      commission: conv(num(t.commission)) ?? 0,
      swap: conv(num(t.swap)) ?? 0,
      rMultiple: numOrNull(t.rMultiple),
      riskPercent: numOrNull(t.riskPercent),
      initialRisk: t.initialRisk === null ? null : conv(num(t.initialRisk)),
      plannedRR: numOrNull(t.plannedRR),
      mfePrice: numOrNull(t.mfePrice),
      maePrice: numOrNull(t.maePrice),
      strategyId: t.strategyId,
      strategyName: t.strategy?.name ?? null,
      sessionId: t.sessionId,
      sessionName: t.session?.name ?? null,
      setup: t.setup,
      timeframe: t.timeframe,
      grade: t.grade,
      tagIds: t.tags.map((x) => x.tag.id),
      tagNames: t.tags.map((x) => x.tag.name),
      emotions,
      followedPlan: journal?.followedPlan ?? null,
      copies: 1,
      memberIds: [t.id],
    });
  }

  // Collapse copies unless the view is a single account (where every copy is its own trade).
  const collapse = opts.collapse ?? filters.accounts.length !== 1;
  const finalTrades = collapse ? mergeCollapsed(trades) : trades;
  return {
    trades: finalTrades,
    rawCount: trades.length,
    collapsed: collapse && finalTrades.length !== trades.length,
    currency: prefs.currency,
    excluded: { count: excludedCount, currencies: [...excludedCurrencies] },
    startingCapital: [...capitalByAccount.values()].reduce((a, b) => a + b, 0),
    timezone: prefs.timezone,
    breakevenTolerance: prefs.breakevenTolerance,
    insightMinTrades: prefs.insightMinTrades,
    maxTradesPerDay: prefs.maxTradesPerDay,
  };
});

function mergeCollapsed(trades: AnalysisTrade[]): AnalysisTrade[] {
  const byId = new Map(trades.map((t) => [t.id, t]));
  return collapseCopies(trades).map((c) => {
    const members = c.memberIds.map((id) => byId.get(id)!);
    return {
      ...c,
      tagIds: [...new Set(members.flatMap((m) => m.tagIds))],
      tagNames: [...new Set(members.flatMap((m) => m.tagNames ?? []))],
      quantity: members.reduce((a, m) => a + m.quantity, 0),
      accountName: members.length > 1 ? `${members.length} accounts` : c.accountName,
      closeDay: members.map((m) => m.closeDay).sort().at(-1)!,
    } as AnalysisTrade;
  });
}
