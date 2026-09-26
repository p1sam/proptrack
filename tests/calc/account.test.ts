import { describe, expect, it } from "vitest";
import {
  calculateDailyLossRemaining,
  calculateDrawdownFloor,
  calculateProfitTargetProgress,
  computeAccountState,
  type LedgerTrade,
} from "@/lib/calc/account";

const at = (d: string) => new Date(d);
const trade = (id: string, closed: string, netPnl: number, extra: Partial<LedgerTrade> = {}): LedgerTrade => ({
  id,
  openedAt: new Date(new Date(closed).getTime() - 30 * 60_000),
  closedAt: at(closed),
  netPnl,
  quantity: 1,
  ...extra,
});

const RULE = { profitTargetPct: 8, maxOverallLossPct: 10, maxDailyLossPct: 5 };

describe("spec example: $10,000 / 8% target / 10% max DD / 5% daily", () => {
  const s = computeAccountState({
    startingBalance: 10000,
    trades: [trade("a", "2026-03-02T14:00:00Z", 300), trade("b", "2026-03-03T14:00:00Z", -80), trade("c", "2026-03-04T14:00:00Z", 200)],
    rule: RULE,
    timezone: "UTC",
    now: at("2026-03-05T10:00:00Z"),
  });
  it("target and progress", () => {
    expect(s.balance).toBe(10420);
    expect(s.profitTarget).toMatchObject({ amount: 800, targetBalance: 10800, currentProfit: 420, progressPct: 52.5, remaining: 380, reached: false });
  });
  it("daily loss remaining with no trades today is the full limit", () => {
    expect(s.dailyLoss).toMatchObject({ limit: 500, remaining: 500, used: 0 });
  });
  it("static max drawdown remaining", () => {
    // floor 9,000 → 1,420 remaining (static rule). The trailing variant is tested below.
    expect(s.overallLoss).toMatchObject({ floor: 9000, remaining: 1420 });
  });
  it("aggregates", () => {
    expect(s.tradingDays).toBe(3);
    expect(s.bestDay?.netPnl).toBe(300);
    expect(s.worstDay?.netPnl).toBe(-80);
    expect(s.averageDailyPnl).toBe(140);
    expect(s.maxDrawdown).toBe(80);
    expect(s.pnlPct).toBe(4.2);
    expect(s.breached).toBe(false);
  });
});

describe("building blocks", () => {
  it("target progress can be negative and above 100", () => {
    expect(calculateProfitTargetProgress(10000, 8, 9800).progressPct).toBe(-25);
    expect(calculateProfitTargetProgress(10000, 8, 11000)).toMatchObject({ progressPct: 125, remaining: 0, reached: true });
  });
  it("daily loss remaining shrinks with today's losses and grows with gains", () => {
    expect(calculateDailyLossRemaining(10420, 500, 10260)).toEqual({ floor: 9920, used: 160, remaining: 340 });
    expect(calculateDailyLossRemaining(10420, 500, 10500).remaining).toBe(580);
  });
  it("trailing floor follows the high-water mark and locks at start", () => {
    expect(calculateDrawdownFloor({ startingBalance: 50000, maxLoss: 2000, type: "TRAILING_EOD", highWaterMark: 51000, locksAtStart: true })).toEqual({ floor: 49000, locked: false });
    expect(calculateDrawdownFloor({ startingBalance: 50000, maxLoss: 2000, type: "TRAILING_EOD", highWaterMark: 52500, locksAtStart: true })).toEqual({ floor: 50000, locked: true });
    expect(calculateDrawdownFloor({ startingBalance: 50000, maxLoss: 2000, type: "TRAILING_EOD", highWaterMark: 52500, locksAtStart: false }).floor).toBe(50500);
  });
});

describe("trailing drawdown", () => {
  it("EOD trailing uses end-of-day balances of completed days only", () => {
    const s = computeAccountState({
      startingBalance: 10000,
      trades: [
        trade("a", "2026-03-02T14:00:00Z", 400),
        trade("b", "2026-03-02T15:00:00Z", -100), // EOD 10300
        trade("c", "2026-03-03T14:00:00Z", 300), // today, intraday 10600
      ],
      rule: { maxOverallLossPct: 10, drawdownType: "TRAILING_EOD" as const, trailingLocksAtStart: false },
      timezone: "UTC",
      now: at("2026-03-03T16:00:00Z"),
    });
    expect(s.overallLoss).toMatchObject({ highWaterMark: 10300, floor: 9300, remaining: 1300 });
  });
  it("balance trailing moves on every closed trade and detects breach", () => {
    const s = computeAccountState({
      startingBalance: 10000,
      trades: [trade("a", "2026-03-02T14:00:00Z", 600), trade("b", "2026-03-02T15:00:00Z", -700), trade("c", "2026-03-03T15:00:00Z", -500)],
      rule: { maxOverallLossPct: 10, drawdownType: "TRAILING_BALANCE" as const, trailingLocksAtStart: false },
      timezone: "UTC",
      now: at("2026-03-04T10:00:00Z"),
    });
    // HWM 10600 → floor 9600; balance 9400 after c
    expect(s.overallLoss).toMatchObject({ floor: 9600, remaining: -200 });
    expect(s.breached).toBe(true);
    expect(s.violations.find((v) => v.ruleKey === "MAX_OVERALL_LOSS")?.tradeId).toBe("c");
  });
});

describe("daily loss breaches and day boundaries", () => {
  it("flags a day whose closed balance dips below the daily floor", () => {
    const s = computeAccountState({
      startingBalance: 10000,
      trades: [trade("a", "2026-03-02T14:00:00Z", -300), trade("b", "2026-03-02T15:00:00Z", -250), trade("c", "2026-03-02T16:00:00Z", 400)],
      rule: RULE,
      timezone: "UTC",
      now: at("2026-03-03T10:00:00Z"),
    });
    const v = s.violations.filter((x) => x.ruleKey === "MAX_DAILY_LOSS");
    expect(v).toHaveLength(1);
    expect(v[0].tradeId).toBe("b");
    expect(s.days[0].minBalance).toBe(9450);
  });
  it("day-start basis uses the balance at the start of the day", () => {
    const s = computeAccountState({
      startingBalance: 10000,
      trades: [trade("a", "2026-03-02T14:00:00Z", 2000), trade("b", "2026-03-03T14:00:00Z", -100)],
      rule: { maxDailyLossPct: 5, dailyLossBasis: "DAY_START_BALANCE" as const },
      timezone: "UTC",
      now: at("2026-03-03T15:00:00Z"),
    });
    expect(s.dailyLoss).toMatchObject({ limit: 600, used: 100, remaining: 500 });
  });
  it("17:00 New York reset groups an evening trade into the next day", () => {
    const s = computeAccountState({
      startingBalance: 50000,
      trades: [trade("a", "2026-03-02T21:30:00Z", 100), trade("b", "2026-03-02T23:00:00Z", 50)],
      rule: { dayResetHour: 17, dayResetTimezone: "America/New_York" },
      timezone: "UTC",
      now: at("2026-03-04T00:00:00Z"),
    });
    // 16:30 ET belongs to Mar 2; 18:00 ET belongs to Mar 3
    expect(s.days.map((d) => d.day)).toEqual(["2026-03-02", "2026-03-03"]);
  });
});

describe("other prop rules", () => {
  it("min trading days, consistency, max size, weekend holding", () => {
    const s = computeAccountState({
      startingBalance: 10000,
      trades: [
        trade("a", "2026-03-02T14:00:00Z", 600, { quantity: 3 }),
        trade("b", "2026-03-03T14:00:00Z", 200),
        trade("w", "2026-03-09T14:00:00Z", 200, { openedAt: at("2026-03-06T20:00:00Z") }),
      ],
      rule: { minTradingDays: 5, consistencyPct: 40, maxPositionSize: 2, weekendHoldingAllowed: false },
      timezone: "UTC",
      now: at("2026-03-10T10:00:00Z"),
    });
    expect(s.minTradingDays).toEqual({ required: 5, remaining: 2, met: false });
    expect(s.consistency).toMatchObject({ bestDay: 600, totalProfit: 1000, ratioPct: 60, passes: false, profitNeeded: 1500 });
    expect(s.violations.map((v) => v.ruleKey).sort()).toEqual(["MAX_POSITION_SIZE", "WEEKEND_HOLDING"]);
  });
  it("withdrawals reduce balance but are not trading drawdown", () => {
    const s = computeAccountState({
      startingBalance: 10000,
      trades: [trade("a", "2026-03-02T14:00:00Z", 1500)],
      withdrawals: [{ id: "p", at: at("2026-03-05T10:00:00Z"), amount: 1000 }],
      rule: { payoutThresholdAmount: 100, payoutFrequencyDays: 14, profitSplitPct: 80 },
      timezone: "UTC",
      now: at("2026-03-20T10:00:00Z"),
      lastPayoutAt: at("2026-03-05T10:00:00Z"),
    });
    expect(s.balance).toBe(10500);
    expect(s.maxDrawdown).toBe(0);
    expect(s.payout).toMatchObject({ eligibleProfit: 500, estimatedTraderShare: 400, thresholdMet: true, daysSinceLastPayout: 15, frequencyMet: true, eligible: true });
  });
  it("pass eligibility requires target, days and no breach", () => {
    const s = computeAccountState({
      startingBalance: 10000,
      trades: [trade("a", "2026-03-02T14:00:00Z", 500), trade("b", "2026-03-03T14:00:00Z", 400)],
      rule: { profitTargetPct: 8, minTradingDays: 2 },
      timezone: "UTC",
      now: at("2026-03-04T10:00:00Z"),
    });
    expect(s.passEligible).toBe(true);
  });
});
