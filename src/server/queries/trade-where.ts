import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { resolveDateBounds, type TradeFilters } from "@/lib/filters";
import { dayKey } from "@/lib/calc/time";

/**
 * Build a Prisma where clause for a user's trades. `userId` is always applied first, so no
 * filter value can widen the scope to another user's data (ids from the URL that belong to
 * someone else simply match nothing).
 */
export function buildTradeWhere(userId: string, f: TradeFilters, opts: { timezone: string; tolerance?: number }): Prisma.TradeWhereInput {
  const and: Prisma.TradeWhereInput[] = [{ userId }];
  const tol = opts.tolerance ?? 0;

  if (f.accounts.length) and.push({ accountId: { in: f.accounts } });
  if (f.firms.length) and.push({ account: { propFirmId: { in: f.firms } } });
  if (f.strategies.length) {
    const none = f.strategies.includes("none");
    const ids = f.strategies.filter((s) => s !== "none");
    and.push({ OR: [...(ids.length ? [{ strategyId: { in: ids } }] : []), ...(none ? [{ strategyId: null }] : [])] });
  }
  if (f.symbols.length) and.push({ symbol: { in: f.symbols } });
  if (f.sessions.length) {
    const none = f.sessions.includes("none");
    const ids = f.sessions.filter((s) => s !== "none");
    and.push({ OR: [...(ids.length ? [{ sessionId: { in: ids } }] : []), ...(none ? [{ sessionId: null }] : [])] });
  }
  if (f.setups.length) and.push({ setup: { in: f.setups } });
  if (f.tags.length) and.push({ tags: { some: { tagId: { in: f.tags } } } });
  if (f.weekdays.length) and.push({ weekday: { in: f.weekdays.map(Number).filter((n) => n >= 0 && n <= 6) } });
  if (f.direction) and.push({ direction: f.direction });

  const status = f.status ?? "CLOSED";
  if (status !== "ALL") and.push({ status });

  if (f.outcome === "WIN") and.push({ netPnl: { gt: tol } });
  if (f.outcome === "LOSS") and.push({ netPnl: { lt: -tol } });
  if (f.outcome === "BREAKEVEN") and.push({ netPnl: { gte: -tol, lte: tol } });
  if (f.minPnl !== undefined) and.push({ netPnl: { gte: f.minPnl } });
  if (f.maxPnl !== undefined) and.push({ netPnl: { lte: f.maxPnl } });
  if (f.minR !== undefined) and.push({ rMultiple: { gte: f.minR } });
  if (f.maxR !== undefined) and.push({ rMultiple: { lte: f.maxR } });

  const today = dayKey(new Date(), opts.timezone);
  const { from, to } = resolveDateBounds(f, today);
  // Dates filter on the trading day of the close (open trades: on the open time).
  if (from) and.push({ OR: [{ tradingDay: { gte: from } }, { tradingDay: null, openedAt: { gte: new Date(`${from}T00:00:00Z`) } }] });
  if (to) and.push({ OR: [{ tradingDay: { lte: to } }, { tradingDay: null, openedAt: { lte: new Date(`${to}T23:59:59Z`) } }] });

  if (f.emotion) {
    const cond: Prisma.IntNullableFilter = {};
    if (f.emotionMin !== undefined) cond.gte = f.emotionMin;
    if (f.emotionMax !== undefined) cond.lte = f.emotionMax;
    if (f.emotionMin === undefined && f.emotionMax === undefined) cond.not = null;
    and.push({ journal: { [f.emotion]: cond } });
  }

  if (f.q) {
    const q = f.q;
    and.push({
      OR: [
        { symbol: { contains: q, mode: "insensitive" } },
        { notes: { contains: q, mode: "insensitive" } },
        { setup: { contains: q, mode: "insensitive" } },
        { strategy: { name: { contains: q, mode: "insensitive" } } },
        { account: { name: { contains: q, mode: "insensitive" } } },
        { tags: { some: { tag: { name: { contains: q, mode: "insensitive" } } } } },
        { journal: { OR: [{ lesson: { contains: q, mode: "insensitive" } }, { thesis: { contains: q, mode: "insensitive" } }, { mistakes: { contains: q, mode: "insensitive" } }] } },
      ],
    });
  }
  return { AND: and };
}
