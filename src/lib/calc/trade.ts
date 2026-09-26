import { D, roundMoney, roundRatio, safeDiv, type Numeric } from "./money";

/** Per-trade calculations: P&L (including partial exits), risk, R multiples, excursions. */

export type TradeDirection = "LONG" | "SHORT";

export interface ExitLeg {
  price: Numeric;
  quantity: Numeric;
}

export function directionSign(direction: TradeDirection): 1 | -1 {
  return direction === "LONG" ? 1 : -1;
}

/** Quantity-weighted average exit price, or null with no exits / zero quantity. */
export function averageExitPrice(exits: ExitLeg[]): number | null {
  let qty = D(0);
  let notional = D(0);
  for (const e of exits) {
    qty = qty.plus(D(e.quantity));
    notional = notional.plus(D(e.price).times(D(e.quantity)));
  }
  if (qty.isZero()) return null;
  return notional.div(qty).toDecimalPlaces(8).toNumber();
}

export function totalExitQuantity(exits: ExitLeg[]): number {
  return exits.reduce((acc, e) => acc.plus(D(e.quantity)), D(0)).toNumber();
}

/**
 * Gross P&L from prices: Σ sign × (exit − entry) × qty × pointValue over each exit leg.
 * `pointValue` is the account-currency value of a 1.0 price move per unit of quantity.
 */
export function calculateGrossPnl(input: {
  direction: TradeDirection;
  entryPrice: Numeric;
  exits: ExitLeg[];
  pointValue: Numeric;
}): number {
  const sign = directionSign(input.direction);
  let total = D(0);
  for (const e of input.exits) {
    total = total.plus(D(e.price).minus(D(input.entryPrice)).times(D(e.quantity)));
  }
  return roundMoney(total.times(sign).times(D(input.pointValue)));
}

/** Net = gross − commission + swap. Commission is a positive cost; swap is signed. */
export function calculateNetPnl(gross: Numeric, commission: Numeric = 0, swap: Numeric = 0): number {
  return roundMoney(D(gross).minus(D(commission).abs()).plus(D(swap)));
}

/** Absolute price distance between entry and stop, or null without a stop. */
export function calculateStopDistance(entryPrice: Numeric, stopLoss: Numeric | null | undefined): number | null {
  if (stopLoss === null || stopLoss === undefined) return null;
  return D(entryPrice).minus(D(stopLoss)).abs().toNumber();
}

/** True when the stop is on the losing side of entry (below for longs, above for shorts). */
export function isStopOnLossSide(direction: TradeDirection, entryPrice: Numeric, stopLoss: Numeric): boolean {
  const diff = D(entryPrice).minus(D(stopLoss));
  return direction === "LONG" ? diff.gt(0) : diff.lt(0);
}

/**
 * Initial risk in account currency. An explicit override wins; otherwise
 * |entry − stop| × qty × pointValue, only when the stop is on the losing side.
 * Returns null when risk is unknown — R metrics then exclude the trade rather than guessing.
 */
export function calculateInitialRisk(input: {
  direction: TradeDirection;
  entryPrice: Numeric;
  stopLoss?: Numeric | null;
  quantity: Numeric;
  pointValue: Numeric;
  override?: Numeric | null;
}): number | null {
  if (input.override !== null && input.override !== undefined) {
    const o = roundMoney(D(input.override).abs());
    return o > 0 ? o : null;
  }
  if (input.stopLoss === null || input.stopLoss === undefined) return null;
  if (!isStopOnLossSide(input.direction, input.entryPrice, input.stopLoss)) return null;
  const risk = roundMoney(
    D(input.entryPrice).minus(D(input.stopLoss)).abs().times(D(input.quantity)).times(D(input.pointValue)),
  );
  return risk > 0 ? risk : null;
}

/** Actual R = net P&L / initial risk. */
export function calculateRMultiple(netPnl: Numeric, initialRisk: Numeric | null | undefined): number | null {
  if (initialRisk === null || initialRisk === undefined) return null;
  const r = safeDiv(netPnl, D(initialRisk).abs());
  return r === null ? null : roundRatio(r, 4);
}

/** Risk as a percentage of the balance at entry. */
export function calculateRiskPercentage(initialRisk: Numeric | null | undefined, balance: Numeric): number | null {
  if (initialRisk === null || initialRisk === undefined) return null;
  const r = safeDiv(D(initialRisk).abs(), balance);
  return r === null || r < 0 ? null : roundRatio(r * 100, 4);
}

/** Planned reward:risk = |target − entry| / |entry − stop|, when both sit on the correct sides. */
export function calculatePlannedRR(input: {
  direction: TradeDirection;
  entryPrice: Numeric;
  stopLoss?: Numeric | null;
  takeProfit?: Numeric | null;
}): number | null {
  const { direction, entryPrice, stopLoss, takeProfit } = input;
  if (stopLoss == null || takeProfit == null) return null;
  if (!isStopOnLossSide(direction, entryPrice, stopLoss)) return null;
  const reward = D(takeProfit).minus(D(entryPrice)).times(directionSign(direction));
  if (reward.lte(0)) return null;
  const r = safeDiv(reward, D(entryPrice).minus(D(stopLoss)).abs());
  return r === null ? null : roundRatio(r, 4);
}

/**
 * Maximum favourable / adverse excursion expressed in R, from the best/worst price reached.
 * MFE is ≥ 0 and MAE ≤ 0 by construction (a price on the wrong side is clamped to 0).
 */
export function calculateExcursionR(input: {
  direction: TradeDirection;
  entryPrice: Numeric;
  stopLoss?: Numeric | null;
  price: Numeric | null | undefined;
  kind: "MFE" | "MAE";
}): number | null {
  const { direction, entryPrice, stopLoss, price, kind } = input;
  if (price == null || stopLoss == null) return null;
  if (!isStopOnLossSide(direction, entryPrice, stopLoss)) return null;
  const move = D(price).minus(D(entryPrice)).times(directionSign(direction));
  const stopDist = D(entryPrice).minus(D(stopLoss)).abs();
  const r = safeDiv(move, stopDist);
  if (r === null) return null;
  const value = kind === "MFE" ? Math.max(0, r) : Math.min(0, r);
  return roundRatio(value, 4);
}

export interface TradeComputationInput {
  direction: TradeDirection;
  entryPrice: Numeric;
  quantity: Numeric;
  pointValue: Numeric;
  exits: ExitLeg[];
  stopLoss?: Numeric | null;
  takeProfit?: Numeric | null;
  commission?: Numeric;
  swap?: Numeric;
  reportedGrossPnl?: Numeric | null;
  riskAmountOverride?: Numeric | null;
  /** Account balance before the trade, for risk %. */
  balanceBefore?: Numeric | null;
}

export interface TradeComputation {
  closed: boolean;
  exitPrice: number | null;
  grossPnl: number | null;
  netPnl: number | null;
  initialRisk: number | null;
  riskPercent: number | null;
  rMultiple: number | null;
  plannedRR: number | null;
  stopDistance: number | null;
}

/**
 * All derived fields of a trade. A trade is closed when its exit quantities cover the full
 * position; open trades have no P&L. A reported gross P&L (from the platform) takes precedence
 * over the price calculation, which is the safest choice for instruments whose point value
 * or quote-currency conversion the journal cannot know exactly.
 */
export function computeTrade(input: TradeComputationInput): TradeComputation {
  const exitQty = D(totalExitQuantity(input.exits));
  const qty = D(input.quantity);
  const closed = input.exits.length > 0 && exitQty.gte(qty);
  const exitPrice = averageExitPrice(input.exits);
  const initialRisk = calculateInitialRisk({ ...input, override: input.riskAmountOverride });
  const plannedRR = calculatePlannedRR(input);
  const stopDistance = calculateStopDistance(input.entryPrice, input.stopLoss);
  const riskPercent =
    input.balanceBefore != null ? calculateRiskPercentage(initialRisk, input.balanceBefore) : null;

  if (!closed) {
    return { closed, exitPrice, grossPnl: null, netPnl: null, initialRisk, riskPercent, rMultiple: null, plannedRR, stopDistance };
  }
  const grossPnl =
    input.reportedGrossPnl != null
      ? roundMoney(input.reportedGrossPnl)
      : calculateGrossPnl({ direction: input.direction, entryPrice: input.entryPrice, exits: input.exits, pointValue: input.pointValue });
  const netPnl = calculateNetPnl(grossPnl, input.commission ?? 0, input.swap ?? 0);
  return {
    closed,
    exitPrice,
    grossPnl,
    netPnl,
    initialRisk,
    riskPercent,
    rMultiple: calculateRMultiple(netPnl, initialRisk),
    plannedRR,
    stopDistance,
  };
}
