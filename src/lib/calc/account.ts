import { calculateMaxDrawdown, cumulativeLevels } from "./drawdown";
import { D, MoneyAccumulator, pctAmount, percentOf, roundMoney, roundRatio, subMoney, sumMoney } from "./money";
import { classifyOutcome } from "./stats";
import { dayKey, daysBetweenKeys, spansWeekend } from "./time";

/**
 * Prop-firm account engine: replays an account's closed trades and withdrawals in time
 * order and derives balances, daily aggregates, drawdown floors, target progress and rule
 * breaches. Everything is measured on closed-trade balance — the journal does not see
 * floating (unrealised) equity, so intraday equity-based limits can be breached on the
 * platform before they show here. The UI states this explicitly.
 */

export type DrawdownType = "STATIC" | "TRAILING_EOD" | "TRAILING_BALANCE";
export type DailyLossBasis = "STARTING_BALANCE" | "DAY_START_BALANCE";

export interface AccountRuleConfig {
  profitTargetPct?: number | null;
  maxDailyLossPct?: number | null;
  dailyLossBasis?: DailyLossBasis;
  maxOverallLossPct?: number | null;
  drawdownType?: DrawdownType;
  trailingLocksAtStart?: boolean;
  minTradingDays?: number | null;
  maxTradingDays?: number | null;
  maxPositionSize?: number | null;
  weekendHoldingAllowed?: boolean;
  newsTradingAllowed?: boolean;
  consistencyPct?: number | null;
  payoutThresholdAmount?: number | null;
  payoutFrequencyDays?: number | null;
  profitSplitPct?: number | null;
  dayResetHour?: number;
  dayResetTimezone?: string | null;
}

export interface LedgerTrade {
  id: string;
  openedAt: Date;
  closedAt: Date;
  netPnl: number;
  quantity: number;
  rMultiple?: number | null;
}

export interface LedgerWithdrawal {
  id: string;
  at: Date;
  amount: number;
}

export interface DaySummary {
  day: string;
  trades: number;
  wins: number;
  losses: number;
  netPnl: number;
  rTotal: number | null;
  startBalance: number;
  endBalance: number;
  minBalance: number;
  /** Overall drawdown floor in force at the end of the day (null without a max-loss rule). */
  floor: number | null;
  /** Daily loss floor for the day (null without a daily-loss rule). */
  dailyFloor: number | null;
}

export interface BalancePoint {
  at: Date;
  balance: number;
  floor: number | null;
  kind: "trade" | "withdrawal";
  refId: string;
}

export interface PropViolation {
  ruleKey: "MAX_DAILY_LOSS" | "MAX_OVERALL_LOSS" | "MAX_POSITION_SIZE" | "WEEKEND_HOLDING" | "MAX_TRADING_DAYS";
  day: string;
  occurredAt: Date;
  tradeId: string | null;
  message: string;
  actual: number | null;
  limit: number | null;
}

export interface AccountState {
  startingBalance: number;
  balance: number;
  /** Closed-trade balance; no open-position marking. */
  equity: number;
  tradingPnl: number;
  totalWithdrawn: number;
  pnlPct: number | null;

  today: string;
  todayPnl: number;
  todayPnlPct: number | null;
  todayStartBalance: number;

  profitTarget: {
    amount: number;
    targetBalance: number;
    currentProfit: number;
    /** Raw progress %, may be negative or above 100. */
    progressPct: number;
    remaining: number;
    reached: boolean;
  } | null;

  dailyLoss: {
    limit: number;
    floor: number;
    used: number;
    remaining: number;
    remainingPct: number | null;
  } | null;

  overallLoss: {
    type: DrawdownType;
    limit: number;
    floor: number;
    highWaterMark: number;
    remaining: number;
    remainingPct: number | null;
    locked: boolean;
  } | null;

  maxDrawdown: number;
  maxDrawdownPct: number | null;
  currentDrawdown: number;
  currentDrawdownPct: number | null;

  tradingDays: number;
  minTradingDays: { required: number; remaining: number; met: boolean } | null;

  consistency: {
    limitPct: number;
    bestDay: number;
    totalProfit: number;
    ratioPct: number | null;
    passes: boolean;
    /** Total profit needed for the current best day to satisfy the rule. */
    profitNeeded: number | null;
  } | null;

  payout: {
    eligibleProfit: number;
    estimatedTraderShare: number | null;
    threshold: number | null;
    thresholdMet: boolean;
    daysSinceLastPayout: number | null;
    frequencyDays: number | null;
    frequencyMet: boolean;
    eligible: boolean;
  };

  bestDay: DaySummary | null;
  worstDay: DaySummary | null;
  averageDailyPnl: number | null;

  days: DaySummary[];
  points: BalancePoint[];
  violations: PropViolation[];
  breached: boolean;
  passEligible: boolean;
  warnings: string[];
}

export interface ComputeAccountInput {
  startingBalance: number;
  trades: LedgerTrade[];
  withdrawals?: LedgerWithdrawal[];
  rule?: AccountRuleConfig | null;
  /** Fallback timezone when the rule has no dayResetTimezone. */
  timezone: string;
  now: Date;
  lastPayoutAt?: Date | null;
  /** When the account started (for payout frequency before the first payout). */
  startedAt?: Date | null;
  breakevenTolerance?: number;
}

// ─── Small, individually tested building blocks ─────────────────────────────

export function calculateProfitTargetProgress(startingBalance: number, targetPct: number, balance: number) {
  const amount = pctAmount(startingBalance, targetPct);
  const currentProfit = subMoney(balance, startingBalance);
  const progressPct = amount > 0 ? roundRatio(D(currentProfit).div(amount).times(100).toNumber(), 4) : 0;
  return {
    amount,
    targetBalance: roundMoney(D(startingBalance).plus(amount)),
    currentProfit,
    progressPct,
    remaining: Math.max(0, subMoney(amount, currentProfit)),
    reached: amount > 0 && currentProfit >= amount,
  };
}

export function calculateDailyLossLimit(
  startingBalance: number,
  dayStartBalance: number,
  pct: number,
  basis: DailyLossBasis = "STARTING_BALANCE",
): number {
  return pctAmount(basis === "STARTING_BALANCE" ? startingBalance : dayStartBalance, pct);
}

/** Remaining daily loss = current balance − (day start balance − limit). */
export function calculateDailyLossRemaining(dayStartBalance: number, limit: number, balance: number) {
  const floor = subMoney(dayStartBalance, limit);
  const used = Math.max(0, subMoney(dayStartBalance, balance));
  return { floor, used, remaining: subMoney(balance, floor) };
}

export function calculateDrawdownFloor(input: {
  startingBalance: number;
  maxLoss: number;
  type: DrawdownType;
  highWaterMark: number;
  locksAtStart: boolean;
}): { floor: number; locked: boolean } {
  if (input.type === "STATIC") return { floor: subMoney(input.startingBalance, input.maxLoss), locked: false };
  const trailing = subMoney(Math.max(input.highWaterMark, input.startingBalance), input.maxLoss);
  if (input.locksAtStart && trailing >= input.startingBalance) return { floor: input.startingBalance, locked: true };
  return { floor: trailing, locked: false };
}

// ─── Engine ─────────────────────────────────────────────────────────────────

type LedgerEvent =
  | { kind: "trade"; at: Date; trade: LedgerTrade }
  | { kind: "withdrawal"; at: Date; withdrawal: LedgerWithdrawal };

export function computeAccountState(input: ComputeAccountInput): AccountState {
  const rule = input.rule ?? {};
  const tz = rule.dayResetTimezone || input.timezone;
  const resetHour = rule.dayResetHour ?? 0;
  const keyOf = (d: Date) => dayKey(d, tz, resetHour);
  const start = roundMoney(input.startingBalance);
  const tol = input.breakevenTolerance ?? 0;

  const events: LedgerEvent[] = [
    ...input.trades.map((t) => ({ kind: "trade" as const, at: t.closedAt, trade: t })),
    ...(input.withdrawals ?? []).map((w) => ({ kind: "withdrawal" as const, at: w.at, withdrawal: w })),
  ].sort((a, b) => a.at.getTime() - b.at.getTime() || (a.kind === b.kind ? 0 : a.kind === "trade" ? -1 : 1));

  const maxLoss = rule.maxOverallLossPct ? pctAmount(start, rule.maxOverallLossPct) : null;
  const ddType: DrawdownType = rule.drawdownType ?? "STATIC";
  const locks = rule.trailingLocksAtStart ?? true;
  const today = keyOf(input.now);

  const balance = new MoneyAccumulator(start);
  let hwm = start; // high-water mark used by trailing floors
  const days = new Map<string, DaySummary>();
  const points: BalancePoint[] = [];
  const violations: PropViolation[] = [];
  const dailyBreachDays = new Set<string>();
  let overallBreached = false;
  let currentDay: DaySummary | null = null;

  const floorNow = () =>
    maxLoss === null ? null : calculateDrawdownFloor({ startingBalance: start, maxLoss, type: ddType, highWaterMark: hwm, locksAtStart: locks }).floor;

  const closeDay = (d: DaySummary) => {
    if (ddType === "TRAILING_EOD" && d.day < today) hwm = Math.max(hwm, d.endBalance);
    d.floor = floorNow();
  };

  for (const ev of events) {
    const key = keyOf(ev.at);
    if (!currentDay || currentDay.day !== key) {
      if (currentDay) closeDay(currentDay);
      const b = balance.value;
      const dailyLimit = rule.maxDailyLossPct ? calculateDailyLossLimit(start, b, rule.maxDailyLossPct, rule.dailyLossBasis) : null;
      currentDay = {
        day: key,
        trades: 0,
        wins: 0,
        losses: 0,
        netPnl: 0,
        rTotal: null,
        startBalance: b,
        endBalance: b,
        minBalance: b,
        floor: floorNow(),
        dailyFloor: dailyLimit === null ? null : subMoney(b, dailyLimit),
      };
      days.set(key, currentDay);
    }
    const day = currentDay;

    if (ev.kind === "trade") {
      const t = ev.trade;
      balance.add(t.netPnl);
      const b = balance.value;
      day.trades += 1;
      const o = classifyOutcome(t.netPnl, tol);
      if (o === "WIN") day.wins += 1;
      if (o === "LOSS") day.losses += 1;
      day.netPnl = sumMoney([day.netPnl, t.netPnl]);
      if (t.rMultiple !== null && t.rMultiple !== undefined) day.rTotal = sumMoney([day.rTotal ?? 0, t.rMultiple]);
      day.endBalance = b;
      day.minBalance = Math.min(day.minBalance, b);

      // Floor in force when this trade closed (HWM before including this trade).
      const floor = floorNow();
      if (floor !== null && b < floor && !overallBreached) {
        overallBreached = true;
        violations.push({
          ruleKey: "MAX_OVERALL_LOSS",
          day: key,
          occurredAt: t.closedAt,
          tradeId: t.id,
          message: `Balance ${b.toFixed(2)} fell below the ${ddType === "STATIC" ? "max loss" : "trailing drawdown"} floor ${floor.toFixed(2)}.`,
          actual: b,
          limit: floor,
        });
      }
      if (day.dailyFloor !== null && b < day.dailyFloor && !dailyBreachDays.has(key)) {
        dailyBreachDays.add(key);
        violations.push({
          ruleKey: "MAX_DAILY_LOSS",
          day: key,
          occurredAt: t.closedAt,
          tradeId: t.id,
          message: `Daily loss of ${subMoney(day.startBalance, b).toFixed(2)} exceeded the limit of ${subMoney(day.startBalance, day.dailyFloor).toFixed(2)}.`,
          actual: subMoney(day.startBalance, b),
          limit: subMoney(day.startBalance, day.dailyFloor),
        });
      }
      if (ddType === "TRAILING_BALANCE") hwm = Math.max(hwm, b);

      if (rule.maxPositionSize && t.quantity > rule.maxPositionSize) {
        violations.push({
          ruleKey: "MAX_POSITION_SIZE",
          day: key,
          occurredAt: t.closedAt,
          tradeId: t.id,
          message: `Position size ${t.quantity} exceeded the maximum of ${rule.maxPositionSize}.`,
          actual: t.quantity,
          limit: rule.maxPositionSize,
        });
      }
      if (rule.weekendHoldingAllowed === false && spansWeekend(t.openedAt, t.closedAt, tz)) {
        violations.push({
          ruleKey: "WEEKEND_HOLDING",
          day: key,
          occurredAt: t.closedAt,
          tradeId: t.id,
          message: "Position was held over a weekend, which this account does not allow.",
          actual: null,
          limit: null,
        });
      }
      points.push({ at: t.closedAt, balance: b, floor: floorNow(), kind: "trade", refId: t.id });
    } else {
      balance.sub(ev.withdrawal.amount);
      const b = balance.value;
      day.endBalance = b;
      day.minBalance = Math.min(day.minBalance, b);
      points.push({ at: ev.at, balance: b, floor: floorNow(), kind: "withdrawal", refId: ev.withdrawal.id });
    }
  }
  if (currentDay) closeDay(currentDay);

  const dayList = [...days.values()].sort((a, b) => a.day.localeCompare(b.day));
  const tradeDays = dayList.filter((d) => d.trades > 0);
  const finalBalance = balance.value;
  const tradingPnl = sumMoney(input.trades.map((t) => t.netPnl));
  const totalWithdrawn = sumMoney((input.withdrawals ?? []).map((w) => w.amount));

  // Today
  const todayDay = days.get(today);
  const todayStartBalance = todayDay ? todayDay.startBalance : finalBalance;
  const todayPnl = todayDay ? todayDay.netPnl : 0;

  // Drawdown on the trading path only (withdrawals are not losses).
  const sortedTrades = [...input.trades].sort((a, b) => a.closedAt.getTime() - b.closedAt.getTime());
  const dd = calculateMaxDrawdown(start, cumulativeLevels(start, sortedTrades.map((t) => t.netPnl)));

  // Profit target
  const profitTarget = rule.profitTargetPct ? calculateProfitTargetProgress(start, rule.profitTargetPct, finalBalance) : null;

  // Daily loss (current day)
  let dailyLoss: AccountState["dailyLoss"] = null;
  if (rule.maxDailyLossPct) {
    const limit = calculateDailyLossLimit(start, todayStartBalance, rule.maxDailyLossPct, rule.dailyLossBasis);
    const r = calculateDailyLossRemaining(todayStartBalance, limit, finalBalance);
    dailyLoss = { limit, ...r, remainingPct: percentOf(Math.max(0, r.remaining), limit) };
  }

  // Overall loss
  let overallLoss: AccountState["overallLoss"] = null;
  if (maxLoss !== null) {
    const { floor, locked } = calculateDrawdownFloor({ startingBalance: start, maxLoss, type: ddType, highWaterMark: hwm, locksAtStart: locks });
    const remaining = subMoney(finalBalance, floor);
    overallLoss = { type: ddType, limit: maxLoss, floor, highWaterMark: hwm, remaining, remainingPct: percentOf(Math.max(0, remaining), maxLoss), locked };
  }

  // Trading days
  const tradingDays = tradeDays.length;
  const minTradingDays = rule.minTradingDays
    ? { required: rule.minTradingDays, remaining: Math.max(0, rule.minTradingDays - tradingDays), met: tradingDays >= rule.minTradingDays }
    : null;
  if (rule.maxTradingDays && tradingDays > rule.maxTradingDays) {
    const d = tradeDays[rule.maxTradingDays];
    violations.push({
      ruleKey: "MAX_TRADING_DAYS",
      day: d.day,
      occurredAt: new Date(`${d.day}T12:00:00Z`),
      tradeId: null,
      message: `Traded on more than the allowed ${rule.maxTradingDays} days.`,
      actual: tradingDays,
      limit: rule.maxTradingDays,
    });
  }

  // Consistency: best winning day as % of total profit
  let consistency: AccountState["consistency"] = null;
  if (rule.consistencyPct) {
    const bestDay = tradeDays.reduce((m, d) => Math.max(m, d.netPnl), 0);
    const totalProfit = tradingPnl;
    const ratioPct = totalProfit > 0 ? percentOf(bestDay, totalProfit) : null;
    consistency = {
      limitPct: rule.consistencyPct,
      bestDay,
      totalProfit,
      ratioPct,
      passes: ratioPct !== null ? ratioPct <= rule.consistencyPct : bestDay === 0,
      profitNeeded: bestDay > 0 ? roundMoney(D(bestDay).div(rule.consistencyPct).times(100)) : null,
    };
  }

  // Payout eligibility (funded accounts): profit above the starting balance.
  const eligibleProfit = Math.max(0, subMoney(finalBalance, start));
  const threshold = rule.payoutThresholdAmount ?? null;
  const ref = input.lastPayoutAt ?? input.startedAt ?? null;
  const daysSinceLastPayout = ref ? daysBetweenKeys(keyOf(ref), today) : null;
  const frequencyDays = rule.payoutFrequencyDays ?? null;
  const thresholdMet = threshold === null ? eligibleProfit > 0 : eligibleProfit >= threshold;
  const frequencyMet = frequencyDays === null || (daysSinceLastPayout !== null && daysSinceLastPayout >= frequencyDays);
  const payout = {
    eligibleProfit,
    estimatedTraderShare: rule.profitSplitPct ? pctAmount(eligibleProfit, rule.profitSplitPct) : null,
    threshold,
    thresholdMet,
    daysSinceLastPayout,
    frequencyDays,
    frequencyMet,
    eligible: thresholdMet && frequencyMet && eligibleProfit > 0 && (minTradingDays?.met ?? true) && (consistency?.passes ?? true),
  };

  const bestDay = tradeDays.reduce<DaySummary | null>((m, d) => (!m || d.netPnl > m.netPnl ? d : m), null);
  const worstDay = tradeDays.reduce<DaySummary | null>((m, d) => (!m || d.netPnl < m.netPnl ? d : m), null);
  const breached = violations.some((v) => v.ruleKey === "MAX_DAILY_LOSS" || v.ruleKey === "MAX_OVERALL_LOSS");

  const warnings: string[] = [];
  if (dailyLoss && dailyLoss.remainingPct !== null && dailyLoss.remainingPct < 25 && dailyLoss.remaining > 0)
    warnings.push(`Only ${dailyLoss.remaining.toFixed(2)} of daily loss allowance remains today.`);
  if (overallLoss && overallLoss.remainingPct !== null && overallLoss.remainingPct < 25 && overallLoss.remaining > 0)
    warnings.push(`Only ${overallLoss.remaining.toFixed(2)} remains before the max drawdown floor.`);
  if (consistency && !consistency.passes) warnings.push("Consistency rule currently not satisfied.");

  return {
    startingBalance: start,
    balance: finalBalance,
    equity: finalBalance,
    tradingPnl,
    totalWithdrawn,
    pnlPct: percentOf(tradingPnl, start),
    today,
    todayPnl,
    todayPnlPct: percentOf(todayPnl, todayStartBalance),
    todayStartBalance,
    profitTarget,
    dailyLoss,
    overallLoss,
    maxDrawdown: dd.amount,
    maxDrawdownPct: dd.pct,
    currentDrawdown: dd.current,
    currentDrawdownPct: dd.currentPct,
    tradingDays,
    minTradingDays,
    consistency,
    payout,
    bestDay,
    worstDay,
    averageDailyPnl: tradeDays.length ? roundMoney(D(sumMoney(tradeDays.map((d) => d.netPnl))).div(tradeDays.length)) : null,
    days: dayList,
    points,
    violations,
    breached,
    passEligible:
      !!profitTarget?.reached && (minTradingDays?.met ?? true) && !breached && (consistency?.passes ?? true),
    warnings,
  };
}
