import { calculateMaxDrawdown, cumulativeLevels } from "./drawdown";
import { D, mean, percentOf, roundRatio, safeDiv, sumMoney } from "./money";

/**
 * Trade statistics. Definitions (documented in docs/metrics.md):
 * - Outcome: win if net > tolerance, loss if net < −tolerance, otherwise break-even.
 * - Win rate = wins / (wins + losses); break-even trades are excluded from the denominator
 *   and reported separately. Loss rate is the complement.
 * - Gross profit / gross loss are sums of net P&L of winners / |net| of losers.
 * - Profit factor = gross profit / gross loss (null when there are no losses).
 * - Expectancy ($) = net profit / all trades (average trade). Expectancy (R) = mean R over trades with known risk.
 * - Break-even trades end both win and loss streaks.
 */

export interface StatTrade {
  id: string;
  netPnl: number;
  grossPnl?: number | null;
  commission?: number | null;
  swap?: number | null;
  rMultiple?: number | null;
  closedAt: Date;
}

export type Outcome = "WIN" | "LOSS" | "BREAKEVEN";

export function classifyOutcome(netPnl: number, tolerance = 0): Outcome {
  if (netPnl > tolerance) return "WIN";
  if (netPnl < -tolerance) return "LOSS";
  return "BREAKEVEN";
}

export function calculateWinRate(wins: number, losses: number): number | null {
  return percentOf(wins, wins + losses);
}

export function calculateProfitFactor(grossProfit: number, grossLoss: number): number | null {
  const r = safeDiv(grossProfit, Math.abs(grossLoss));
  return r === null ? null : roundRatio(r, 4);
}

/**
 * Expectancy per trade from components: winRate × avgWin − lossRate × |avgLoss|.
 * Rates are fractions of all trades (break-evens contribute 0), which makes this equal to the
 * mean net P&L per trade.
 */
export function calculateExpectancy(input: {
  wins: number;
  losses: number;
  breakevens?: number;
  avgWin: number | null;
  avgLoss: number | null;
}): number | null {
  const total = input.wins + input.losses + (input.breakevens ?? 0);
  if (total === 0) return null;
  const w = D(input.wins).div(total).times(D(input.avgWin ?? 0));
  const l = D(input.losses).div(total).times(D(Math.abs(input.avgLoss ?? 0)));
  return roundRatio(w.minus(l).toNumber(), 4);
}

export function calculateStreaks(outcomes: Outcome[]): {
  maxWins: number;
  maxLosses: number;
  current: { type: Outcome | null; count: number };
} {
  let maxWins = 0;
  let maxLosses = 0;
  let curType: Outcome | null = null;
  let cur = 0;
  for (const o of outcomes) {
    if (o === curType) cur += 1;
    else {
      curType = o;
      cur = 1;
    }
    if (o === "WIN") maxWins = Math.max(maxWins, cur);
    if (o === "LOSS") maxLosses = Math.max(maxLosses, cur);
  }
  return { maxWins, maxLosses, current: { type: curType, count: cur } };
}

export interface TradeStats {
  totalTrades: number;
  wins: number;
  losses: number;
  breakevens: number;
  winRate: number | null;
  lossRate: number | null;
  grossProfit: number;
  grossLoss: number;
  netProfit: number;
  totalCommission: number;
  totalSwap: number;
  profitFactor: number | null;
  expectancy: number | null;
  averageTrade: number | null;
  averageWinner: number | null;
  averageLoser: number | null;
  payoffRatio: number | null;
  tradesWithR: number;
  averageR: number | null;
  totalR: number | null;
  bestTrade: StatTrade | null;
  worstTrade: StatTrade | null;
  maxDrawdown: number;
  maxDrawdownPct: number | null;
  currentDrawdown: number;
  recoveryFactor: number | null;
  maxConsecutiveWins: number;
  maxConsecutiveLosses: number;
  currentStreak: { type: Outcome | null; count: number };
}

export function computeTradeStats(
  trades: StatTrade[],
  opts: { breakevenTolerance?: number; startingCapital?: number } = {},
): TradeStats {
  const tol = opts.breakevenTolerance ?? 0;
  const sorted = [...trades].sort((a, b) => a.closedAt.getTime() - b.closedAt.getTime() || a.id.localeCompare(b.id));
  const outcomes = sorted.map((t) => classifyOutcome(t.netPnl, tol));
  const winners = sorted.filter((_, i) => outcomes[i] === "WIN");
  const losers = sorted.filter((_, i) => outcomes[i] === "LOSS");
  const grossProfit = sumMoney(winners.map((t) => t.netPnl));
  const grossLoss = Math.abs(sumMoney(losers.map((t) => t.netPnl)));
  const netProfit = sumMoney(sorted.map((t) => t.netPnl));
  const rs = sorted.map((t) => t.rMultiple).filter((r): r is number => r !== null && r !== undefined);
  const averageWinner = winners.length ? mean(winners.map((t) => t.netPnl)) : null;
  const averageLoser = losers.length ? mean(losers.map((t) => t.netPnl)) : null;

  const initial = opts.startingCapital ?? 0;
  const levels = cumulativeLevels(initial, sorted.map((t) => t.netPnl));
  const dd = calculateMaxDrawdown(initial, levels);
  const streaks = calculateStreaks(outcomes);

  let best: StatTrade | null = null;
  let worst: StatTrade | null = null;
  for (const t of sorted) {
    if (!best || t.netPnl > best.netPnl) best = t;
    if (!worst || t.netPnl < worst.netPnl) worst = t;
  }

  return {
    totalTrades: sorted.length,
    wins: winners.length,
    losses: losers.length,
    breakevens: sorted.length - winners.length - losers.length,
    winRate: calculateWinRate(winners.length, losers.length),
    lossRate: percentOf(losers.length, winners.length + losers.length),
    grossProfit,
    grossLoss,
    netProfit,
    totalCommission: sumMoney(sorted.map((t) => Math.abs(t.commission ?? 0))),
    totalSwap: sumMoney(sorted.map((t) => t.swap ?? 0)),
    profitFactor: calculateProfitFactor(grossProfit, grossLoss),
    expectancy: sorted.length ? mean(sorted.map((t) => t.netPnl)) : null,
    averageTrade: sorted.length ? mean(sorted.map((t) => t.netPnl)) : null,
    averageWinner,
    averageLoser,
    payoffRatio: averageWinner !== null && averageLoser ? roundRatio(Math.abs(averageWinner / averageLoser), 4) : null,
    tradesWithR: rs.length,
    averageR: rs.length ? roundRatio(mean(rs) ?? 0, 4) : null,
    totalR: rs.length ? sumMoney(rs) : null,
    bestTrade: best,
    worstTrade: worst,
    maxDrawdown: dd.amount,
    maxDrawdownPct: opts.startingCapital ? dd.pct : null,
    currentDrawdown: dd.current,
    recoveryFactor: dd.amount > 0 ? roundRatio(netProfit / dd.amount, 4) : null,
    maxConsecutiveWins: streaks.maxWins,
    maxConsecutiveLosses: streaks.maxLosses,
    currentStreak: streaks.current,
  };
}

/**
 * Sharpe and Sortino on daily returns (daily P&L / capital at the start of the day), annualised
 * with √252. Only days with trades are included. Returns null below `minDays` observations or with
 * zero dispersion — a ratio from a handful of days is noise, not information.
 */
export function calculateRiskAdjustedRatios(
  dailyReturnsPct: number[],
  opts: { minDays?: number; periodsPerYear?: number } = {},
): { sharpe: number | null; sortino: number | null; days: number } {
  const minDays = opts.minDays ?? 20;
  const n = dailyReturnsPct.length;
  if (n < minDays) return { sharpe: null, sortino: null, days: n };
  const annual = Math.sqrt(opts.periodsPerYear ?? 252);
  const r = dailyReturnsPct.map((x) => x / 100);
  const avg = r.reduce((a, b) => a + b, 0) / n;
  const variance = r.reduce((a, b) => a + (b - avg) ** 2, 0) / (n - 1);
  const sd = Math.sqrt(variance);
  const downside = Math.sqrt(r.reduce((a, b) => a + Math.min(0, b) ** 2, 0) / n);
  return {
    sharpe: sd > 0 ? roundRatio((avg / sd) * annual, 3) : null,
    sortino: downside > 0 ? roundRatio((avg / downside) * annual, 3) : null,
    days: n,
  };
}

export interface GroupStats {
  key: string;
  label: string;
  trades: number;
  wins: number;
  losses: number;
  winRate: number | null;
  netPnl: number;
  averageR: number | null;
  tradesWithR: number;
  profitFactor: number | null;
  expectancy: number | null;
  maxDrawdown: number;
  bestTrade: number | null;
  worstTrade: number | null;
}

/** Break a trade set down by an arbitrary key (strategy, instrument, session, weekday, tag...). */
export function breakdownBy<T extends StatTrade>(
  trades: T[],
  keyFn: (t: T) => string | string[] | null | undefined,
  labelFn: (key: string) => string = (k) => k,
  opts: { breakevenTolerance?: number } = {},
): GroupStats[] {
  const groups = new Map<string, T[]>();
  for (const t of trades) {
    const raw = keyFn(t);
    const keys = raw === null || raw === undefined ? ["__none__"] : Array.isArray(raw) ? raw : [raw];
    for (const k of keys.length ? keys : ["__none__"]) {
      const arr = groups.get(k) ?? [];
      arr.push(t);
      groups.set(k, arr);
    }
  }
  return [...groups.entries()].map(([key, list]) => {
    const s = computeTradeStats(list, opts);
    return {
      key,
      label: key === "__none__" ? "Unassigned" : labelFn(key),
      trades: s.totalTrades,
      wins: s.wins,
      losses: s.losses,
      winRate: s.winRate,
      netPnl: s.netProfit,
      averageR: s.averageR,
      tradesWithR: s.tradesWithR,
      profitFactor: s.profitFactor,
      expectancy: s.expectancy,
      maxDrawdown: s.maxDrawdown,
      bestTrade: s.bestTrade?.netPnl ?? null,
      worstTrade: s.worstTrade?.netPnl ?? null,
    };
  });
}
