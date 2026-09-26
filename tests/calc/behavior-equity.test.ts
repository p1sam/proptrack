import { describe, expect, it } from "vitest";
import { analyzeEmotions, analyzeRapidTrades, analyzeSequences, analyzeSizingAfterLosses, analyzeTradesPerDay, buildInsights, pearson, type BehaviorTrade } from "@/lib/calc/behavior";
import { buildDailySeries, buildEquitySeries, buildMonthlySeries, rDistribution, summarizeDays } from "@/lib/calc/equity";

let seq = 0;
const bt = (day: string, hour: number, netPnl: number, r: number | null, extra: Partial<BehaviorTrade> = {}): BehaviorTrade => {
  const openedAt = new Date(`${day}T${String(hour).padStart(2, "0")}:00:00Z`);
  return { id: `t${seq++}`, day, openedAt, closedAt: new Date(openedAt.getTime() + 20 * 60_000), netPnl, rMultiple: r, ...extra };
};

describe("sequences", () => {
  const trades = [
    bt("2026-03-02", 9, -100, -1),
    bt("2026-03-02", 10, -100, -1),
    bt("2026-03-02", 11, 50, 0.5),
    bt("2026-03-02", 12, -100, -1),
    bt("2026-03-03", 9, 200, 2),
    bt("2026-03-03", 10, -100, -1),
  ];
  const s = analyzeSequences(trades);
  it("after-loss / after-win / after-two-losses", () => {
    expect(s.afterLoss.n).toBe(2); // t1 (after t0), t2 (after t1)
    expect(s.afterWin.n).toBe(2); // t3 after t2, t5 after t4
    expect(s.afterTwoLosses.n).toBe(1);
    expect(s.afterTwoLosses.winRate).toBe(100);
  });
  it("after first loss of the day and follow-up counts", () => {
    expect(s.afterFirstLossOfDay.n).toBe(3); // t1, t2, t3
    // losses: t0 → 3 more, t1 → 2, t3 → 0, t5 → 0 → avg 1.25
    expect(s.avgTradesAfterLoss).toBe(1.25);
  });
});

describe("sizing and rapid trades", () => {
  it("detects risk increase after a loss", () => {
    const trades = [
      bt("2026-03-02", 9, -100, -1, { riskPercent: 1 }),
      bt("2026-03-02", 10, -100, -1, { riskPercent: 2 }),
      bt("2026-03-02", 11, 100, 1, { riskPercent: 2 }),
      bt("2026-03-02", 12, 100, 1, { riskPercent: 2 }),
    ];
    const s = analyzeSizingAfterLosses(trades);
    expect(s.pairsAfterLoss).toBe(2);
    expect(s.increasedAfterLossPct).toBe(50);
    expect(s.avgRiskChangeAfterLossPct).toBe(50);
    expect(s.increasedAfterWinPct).toBe(0);
  });
  it("rapid re-entries", () => {
    const a = bt("2026-03-02", 9, -100, -1);
    const b = { ...bt("2026-03-02", 9, -50, -0.5), openedAt: new Date(a.closedAt.getTime() + 5 * 60_000) };
    const r = analyzeRapidTrades([a, b], 10);
    expect(r.rapidAfterLoss.n).toBe(1);
  });
  it("trades per day buckets", () => {
    const trades = [bt("2026-03-02", 9, 10, null), bt("2026-03-03", 9, 10, null), bt("2026-03-03", 10, -30, null), bt("2026-03-03", 11, -30, null)];
    const r = analyzeTradesPerDay(trades, 2);
    expect(r.avgTradesPerDay).toBe(2);
    expect(r.overLimit).toMatchObject({ days: 1, netPnl: -50 });
    expect(r.withinLimit).toMatchObject({ days: 1, netPnl: 10 });
  });
});

describe("emotions and insights", () => {
  it("pearson", () => {
    expect(pearson([1, 2, 3, 4], [2, 4, 6, 8])).toBe(1);
    expect(pearson([1, 1, 1], [1, 2, 3])).toBeNull();
  });
  it("emotion levels", () => {
    const trades = [1, 2, 3, 4, 5].map((lvl) => bt("2026-03-02", 8 + lvl, lvl * 10 - 25, lvl - 2.5, { emotions: { discipline: lvl } }));
    const e = analyzeEmotions(trades).find((x) => x.emotion === "discipline")!;
    expect(e.n).toBe(5);
    expect(e.correlationWithR).toBe(1);
    expect(e.levels[0]).toMatchObject({ level: 1, n: 1, averageR: -1.5 });
  });
  it("no insights below the minimum sample", () => {
    expect(buildInsights({ trades: [bt("2026-03-02", 9, 1, 1)], minTrades: 20 })).toEqual([]);
  });
  it("tag insight appears only with enough trades", () => {
    const trades: BehaviorTrade[] = [];
    for (let i = 0; i < 12; i++) trades.push(bt(`2026-04-${String(i + 1).padStart(2, "0")}`, 9, 100, 1));
    for (let i = 0; i < 8; i++) trades.push(bt(`2026-05-${String(i + 1).padStart(2, "0")}`, 9, -170, -1.7, { tagNames: ["Revenge trade"] }));
    const ins = buildInsights({ trades, minTrades: 20, minGroup: 5 });
    const tag = ins.find((i) => i.id === "tag-Revenge trade");
    expect(tag?.text).toContain("−1.70R".replace("−", "-"));
    expect(tag?.sample).toBe(8);
  });
});

describe("equity series", () => {
  const trades = [
    { id: "a", closedAt: new Date("2026-03-02T10:00:00Z"), netPnl: 100, rMultiple: 1 },
    { id: "b", closedAt: new Date("2026-03-02T12:00:00Z"), netPnl: -300, rMultiple: -1.5 },
    { id: "c", closedAt: new Date("2026-04-01T12:00:00Z"), netPnl: 50.25, rMultiple: null },
  ];
  it("balance, cumulative R, drawdown, %", () => {
    const s = buildEquitySeries(trades, 10000);
    expect(s.map((p) => p.balance)).toEqual([10100, 9800, 9850.25]);
    expect(s.map((p) => p.cumR)).toEqual([1, -0.5, -0.5]);
    expect(s[1].drawdown).toBe(300);
    expect(s[2].returnPct).toBe(-1.4975);
  });
  it("daily & monthly aggregation", () => {
    const d = buildDailySeries(trades, "UTC");
    expect(d).toHaveLength(2);
    expect(d[0]).toMatchObject({ day: "2026-03-02", pnl: -200, trades: 2, wins: 1, losses: 1, winRate: 50, rTotal: -0.5 });
    const m = buildMonthlySeries(d);
    expect(m.map((x) => x.month)).toEqual(["2026-03", "2026-04"]);
    const sum = summarizeDays(d);
    expect(sum).toMatchObject({ netPnl: -149.75, winningDays: 1, losingDays: 1, totalTrades: 3 });
  });
  it("R distribution", () => {
    const r = rDistribution([-3, -1, 0.2, 5]);
    expect(r[0].count).toBe(1);
    expect(r[r.length - 1].count).toBe(1);
    expect(r.reduce((a, b) => a + b.count, 0)).toBe(4);
  });
});
