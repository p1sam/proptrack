import { describe, expect, it } from "vitest";
import {
  breakdownBy,
  calculateExpectancy,
  calculateProfitFactor,
  calculateRiskAdjustedRatios,
  calculateStreaks,
  calculateWinRate,
  classifyOutcome,
  computeTradeStats,
  type StatTrade,
} from "@/lib/calc/stats";

const t = (id: number, netPnl: number, r: number | null = null, extra: Partial<StatTrade> = {}): StatTrade => ({
  id: String(id),
  netPnl,
  rMultiple: r,
  closedAt: new Date(Date.UTC(2026, 0, 1, 0, id)),
  ...extra,
});

describe("building blocks", () => {
  it("classifies with tolerance", () => {
    expect(classifyOutcome(0)).toBe("BREAKEVEN");
    expect(classifyOutcome(0.5, 1)).toBe("BREAKEVEN");
    expect(classifyOutcome(-1.01, 1)).toBe("LOSS");
  });
  it("win rate excludes break-evens", () => {
    expect(calculateWinRate(3, 1)).toBe(75);
    expect(calculateWinRate(0, 0)).toBeNull();
  });
  it("profit factor", () => {
    expect(calculateProfitFactor(300, 100)).toBe(3);
    expect(calculateProfitFactor(300, 0)).toBeNull();
  });
  it("expectancy from components equals mean trade", () => {
    // 2 wins avg 150, 1 loss avg −100, 1 BE → (300 − 100) / 4 = 50
    expect(calculateExpectancy({ wins: 2, losses: 1, breakevens: 1, avgWin: 150, avgLoss: -100 })).toBe(50);
  });
  it("streaks; break-even resets", () => {
    const s = calculateStreaks(["WIN", "WIN", "BREAKEVEN", "WIN", "LOSS", "LOSS", "LOSS", "WIN"]);
    expect(s.maxWins).toBe(2);
    expect(s.maxLosses).toBe(3);
    expect(s.current).toEqual({ type: "WIN", count: 1 });
  });
});

describe("computeTradeStats", () => {
  const trades = [t(1, 100, 1), t(2, -50, -0.5), t(3, 200, 2), t(4, 0, 0), t(5, -150, -1.5), t(6, 50.1, 0.5)];
  const s = computeTradeStats(trades, { startingCapital: 10000 });
  it("counts and rates", () => {
    expect(s.totalTrades).toBe(6);
    expect(s.wins).toBe(3);
    expect(s.losses).toBe(2);
    expect(s.breakevens).toBe(1);
    expect(s.winRate).toBe(60);
  });
  it("money aggregates are exact", () => {
    expect(s.grossProfit).toBe(350.1);
    expect(s.grossLoss).toBe(200);
    expect(s.netProfit).toBe(150.1);
    expect(s.profitFactor).toBe(1.7505);
    expect(s.expectancy).toBeCloseTo(25.016667, 5);
    expect(s.averageWinner).toBe(116.7);
    expect(s.averageLoser).toBe(-100);
  });
  it("R aggregates", () => {
    expect(s.tradesWithR).toBe(6);
    expect(s.averageR).toBe(0.25);
    expect(s.totalR).toBe(1.5);
  });
  it("drawdown and recovery", () => {
    // path: 10100, 10050, 10250, 10250, 10100, 10150.1 → max DD 150 from 10250
    expect(s.maxDrawdown).toBe(150);
    expect(s.maxDrawdownPct).toBeCloseTo(1.463415, 5);
    expect(s.currentDrawdown).toBe(99.9);
    expect(s.recoveryFactor).toBeCloseTo(1.0007, 4);
    expect(s.bestTrade?.id).toBe("3");
    expect(s.worstTrade?.id).toBe("5");
  });
  it("empty input", () => {
    const e = computeTradeStats([]);
    expect(e.totalTrades).toBe(0);
    expect(e.winRate).toBeNull();
    expect(e.profitFactor).toBeNull();
    expect(e.expectancy).toBeNull();
  });
});

describe("ratios", () => {
  it("null with insufficient days", () => {
    expect(calculateRiskAdjustedRatios([1, 2, 3]).sharpe).toBeNull();
  });
  it("computes for enough days", () => {
    const r = calculateRiskAdjustedRatios(Array.from({ length: 30 }, (_, i) => (i % 3 === 0 ? -0.5 : 0.4)));
    expect(r.sharpe).not.toBeNull();
    expect(r.sortino).not.toBeNull();
    expect(r.sortino!).toBeGreaterThan(r.sharpe!);
  });
});

describe("breakdownBy", () => {
  it("groups multi-valued keys", () => {
    const list = [
      { ...t(1, 100, 1), tags: ["A", "B"] },
      { ...t(2, -50, -1), tags: ["A"] },
      { ...t(3, 20, null), tags: [] },
    ];
    const g = breakdownBy(list, (x) => x.tags);
    const a = g.find((x) => x.key === "A")!;
    expect(a.trades).toBe(2);
    expect(a.netPnl).toBe(50);
    expect(g.find((x) => x.key === "__none__")!.label).toBe("Unassigned");
  });
});
