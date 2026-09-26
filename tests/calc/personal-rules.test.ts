import { describe, expect, it } from "vitest";
import { evaluatePersonalRules, wouldBreakHardLimit, type PersonalRule, type RuleTrade } from "@/lib/calc/personal-rules";

const tr = (id: string, hour: number, netPnl: number | null, extra: Partial<RuleTrade> = {}): RuleTrade => {
  const openedAt = new Date(`2026-03-02T${String(hour).padStart(2, "0")}:00:00Z`);
  return { id, openedAt, closedAt: new Date(openedAt.getTime() + 15 * 60_000), day: "2026-03-02", netPnl, riskPercent: 1, quantity: 1, ...extra };
};
const opts = { timezone: "UTC", dayStartBalance: () => 10000 };

describe("personal rules", () => {
  const trades = [tr("a", 9, -100), tr("b", 10, -120, { riskPercent: 1.5 }), tr("c", 11, 50), tr("d", 12, -90)];
  it("risk %, losers per day, trades per day", () => {
    const rules: PersonalRule[] = [
      { id: "r1", type: "MAX_RISK_PER_TRADE_PCT", value: 1 },
      { id: "r2", type: "MAX_LOSING_TRADES_PER_DAY", value: 2 },
      { id: "r3", type: "MAX_TRADES_PER_DAY", value: 3 },
    ];
    const v = evaluatePersonalRules(trades, rules, opts);
    expect(v.map((x) => `${x.ruleId}:${x.tradeId}`).sort()).toEqual(["r1:b", "r2:d", "r3:d"]);
  });
  it("daily loss % and consecutive losses", () => {
    const v = evaluatePersonalRules(trades, [{ id: "dl", type: "MAX_DAILY_LOSS_PCT", value: 2 }, { id: "cl", type: "MAX_CONSECUTIVE_LOSSES_PER_DAY", value: 2 }], opts);
    // −100, −220 → exceeds 200 at b; streak of 2 then c is taken
    expect(v.map((x) => `${x.ruleId}:${x.tradeId}`).sort()).toEqual(["cl:c", "dl:b"]);
  });
  it("trading hours and minimum spacing", () => {
    const v = evaluatePersonalRules(
      [tr("a", 7, 10), { ...tr("b", 8, 10), openedAt: new Date("2026-03-02T07:20:00Z") }],
      [{ id: "h", type: "TRADING_HOURS", startMinute: 8 * 60, endMinute: 16 * 60 }, { id: "m", type: "MIN_MINUTES_BETWEEN_TRADES", value: 15 }],
      opts,
    );
    expect(v.map((x) => `${x.ruleId}:${x.tradeId}`).sort()).toEqual(["h:a", "h:b", "m:b"]);
  });
  it("inactive rules are ignored", () => {
    expect(evaluatePersonalRules(trades, [{ id: "x", type: "MAX_TRADES_PER_DAY", value: 1, isActive: false }], opts)).toEqual([]);
  });
});

describe("hard limits", () => {
  const existing = [tr("a", 9, -100), tr("b", 10, -120)];
  it("only hard rules can block", () => {
    const cand = tr("new", 13, null, { closedAt: null });
    expect(wouldBreakHardLimit(existing, cand, [{ id: "r", type: "MAX_LOSING_TRADES_PER_DAY", value: 2 }], opts)).toEqual([]);
    const v = wouldBreakHardLimit(existing, cand, [{ id: "r", type: "MAX_LOSING_TRADES_PER_DAY", value: 2, hardLimit: true }], opts);
    expect(v).toHaveLength(1);
  });
  it("blocks the next trade after the daily loss limit is reached, not the losing trade itself", () => {
    const rules: PersonalRule[] = [{ id: "d", type: "MAX_DAILY_LOSS_AMOUNT", value: 200, hardLimit: true }];
    const early = tr("x", 9, -300, { openedAt: new Date("2026-03-02T08:00:00Z"), closedAt: new Date("2026-03-02T08:30:00Z") });
    expect(wouldBreakHardLimit([], early, rules, opts)).toEqual([]);
    expect(wouldBreakHardLimit(existing, tr("n", 13, null, { closedAt: null }), rules, opts)).toHaveLength(1);
  });
  it("trades-per-day and risk-per-trade", () => {
    const rules: PersonalRule[] = [
      { id: "t", type: "MAX_TRADES_PER_DAY", value: 2, hardLimit: true },
      { id: "k", type: "MAX_RISK_PER_TRADE_PCT", value: 1, hardLimit: true },
    ];
    const v = wouldBreakHardLimit(existing, tr("n", 13, null, { riskPercent: 2, closedAt: null }), rules, opts);
    expect(v.map((x) => x.ruleId).sort()).toEqual(["k", "t"]);
  });
});
