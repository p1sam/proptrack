import { describe, expect, it } from "vitest";
import {
  averageExitPrice,
  calculateExcursionR,
  calculateGrossPnl,
  calculateInitialRisk,
  calculateNetPnl,
  calculatePlannedRR,
  calculateRMultiple,
  calculateRiskPercentage,
  calculateStopDistance,
  computeTrade,
} from "@/lib/calc/trade";

describe("P&L", () => {
  it("long forex trade in lots", () => {
    // 1 lot EURUSD, point value 100000, +25 pips
    expect(calculateGrossPnl({ direction: "LONG", entryPrice: 1.085, exits: [{ price: 1.0875, quantity: 1 }], pointValue: 100000 })).toBe(250);
  });
  it("short trade profits when price falls", () => {
    expect(calculateGrossPnl({ direction: "SHORT", entryPrice: 2400, exits: [{ price: 2390.5, quantity: 0.5 }], pointValue: 100 })).toBe(475);
  });
  it("partial exits are summed leg by leg", () => {
    const exits = [
      { price: 18010, quantity: 1 },
      { price: 18040, quantity: 1 },
    ];
    expect(calculateGrossPnl({ direction: "LONG", entryPrice: 18000, exits, pointValue: 20 })).toBe(200 + 800);
    expect(averageExitPrice(exits)).toBe(18025);
  });
  it("net = gross − commission + swap (swap signed)", () => {
    expect(calculateNetPnl(250, 7, -1.35)).toBe(241.65);
    expect(calculateNetPnl(250, -7, 2)).toBe(245); // commission sign-insensitive
  });
});

describe("risk and R", () => {
  it("stop distance and initial risk", () => {
    expect(calculateStopDistance(1.085, 1.083)).toBeCloseTo(0.002, 10);
    expect(calculateInitialRisk({ direction: "LONG", entryPrice: 1.085, stopLoss: 1.083, quantity: 1, pointValue: 100000 })).toBe(200);
  });
  it("stop on the wrong side yields unknown risk", () => {
    expect(calculateInitialRisk({ direction: "LONG", entryPrice: 1.085, stopLoss: 1.09, quantity: 1, pointValue: 100000 })).toBeNull();
    expect(calculateInitialRisk({ direction: "SHORT", entryPrice: 1.085, stopLoss: 1.08, quantity: 1, pointValue: 100000 })).toBeNull();
  });
  it("override wins", () => {
    expect(calculateInitialRisk({ direction: "LONG", entryPrice: 1, stopLoss: null, quantity: 1, pointValue: 1, override: 150 })).toBe(150);
  });
  it("R multiple and risk %", () => {
    expect(calculateRMultiple(-200, 200)).toBe(-1);
    expect(calculateRMultiple(350, 200)).toBe(1.75);
    expect(calculateRMultiple(100, null)).toBeNull();
    expect(calculateRiskPercentage(100, 10000)).toBe(1);
    expect(calculateRiskPercentage(100, 0)).toBeNull();
  });
  it("planned R:R", () => {
    expect(calculatePlannedRR({ direction: "LONG", entryPrice: 100, stopLoss: 98, takeProfit: 106 })).toBe(3);
    expect(calculatePlannedRR({ direction: "SHORT", entryPrice: 100, stopLoss: 102, takeProfit: 95 })).toBe(2.5);
    expect(calculatePlannedRR({ direction: "LONG", entryPrice: 100, stopLoss: 98, takeProfit: 97 })).toBeNull();
  });
  it("MFE/MAE in R", () => {
    const base = { direction: "LONG" as const, entryPrice: 100, stopLoss: 98 };
    expect(calculateExcursionR({ ...base, price: 105, kind: "MFE" })).toBe(2.5);
    expect(calculateExcursionR({ ...base, price: 99, kind: "MAE" })).toBe(-0.5);
    expect(calculateExcursionR({ ...base, price: 101, kind: "MAE" })).toBe(0);
  });
});

describe("computeTrade", () => {
  it("open trade has no P&L", () => {
    const r = computeTrade({ direction: "LONG", entryPrice: 100, quantity: 2, pointValue: 1, exits: [{ price: 101, quantity: 1 }] });
    expect(r.closed).toBe(false);
    expect(r.netPnl).toBeNull();
  });
  it("closed trade with commission, swap and risk %", () => {
    const r = computeTrade({
      direction: "LONG",
      entryPrice: 1.085,
      stopLoss: 1.083,
      takeProfit: 1.091,
      quantity: 1,
      pointValue: 100000,
      exits: [{ price: 1.0875, quantity: 1 }],
      commission: 7,
      swap: -1,
      balanceBefore: 10000,
    });
    expect(r).toMatchObject({ closed: true, grossPnl: 250, netPnl: 242, initialRisk: 200, riskPercent: 2, rMultiple: 1.21, plannedRR: 3 });
  });
  it("reported gross P&L overrides price math", () => {
    const r = computeTrade({ direction: "LONG", entryPrice: 150, quantity: 1, pointValue: 1000, exits: [{ price: 151, quantity: 1 }], reportedGrossPnl: 662.25 });
    expect(r.grossPnl).toBe(662.25);
  });
});
