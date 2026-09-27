import { describe, expect, it } from "vitest";
import { computePayoutStats, payoutEventSpecs, payoutIssues, shouldMarkAccountReceived, suggestAmountReceived, type PayoutStatItem } from "@/lib/calc/payouts";
import { countExceeding, dailyRiskSeries, riskPctHistogram, samplesNeeded, strictestLimit, summarizeRisk } from "@/lib/calc/risk";
import { allowanceTone, propRuleTones } from "@/lib/calc/rule-status";

const d = (s: string) => new Date(s);

describe("payout amounts and validation", () => {
  it("suggests requested × split − fees", () => {
    expect(suggestAmountReceived(1000, 80, 25)).toBe(775);
    expect(suggestAmountReceived(1000.1, 90, 0)).toBe(900.09);
    expect(suggestAmountReceived(100, null, 0)).toBe(100);
    expect(suggestAmountReceived(100, 10, 50)).toBe(0);
    expect(suggestAmountReceived(null, 80, 0)).toBeNull();
  });

  const base = { status: "REQUESTED" as const, requestedAt: d("2026-05-01T10:00Z"), approvedAt: null, paidAt: null, amountRequested: 1000, amountReceived: null };
  const now = d("2026-06-01T00:00Z");
  it("paid requires payment date and amount", () => {
    const issues = payoutIssues({ ...base, status: "PAID" }, now);
    expect(issues.filter((i) => i.level === "error").map((i) => i.field).sort()).toEqual(["amountReceived", "paidAt"]);
  });
  it("dates must be in order", () => {
    const i = payoutIssues({ ...base, status: "PAID", approvedAt: d("2026-04-30T00:00Z"), paidAt: d("2026-04-29T00:00Z"), amountReceived: 800 }, now);
    expect(i.map((x) => `${x.field}:${x.level}`).sort()).toEqual(["approvedAt:error", "paidAt:error"]);
    const j = payoutIssues({ ...base, status: "PAID", paidAt: d("2026-04-29T00:00Z"), amountReceived: 800 }, now);
    expect(j.map((x) => x.field)).toEqual(["paidAt"]);
  });
  it("received above requested is only a warning", () => {
    const i = payoutIssues({ ...base, status: "PAID", paidAt: d("2026-05-03T00:00Z"), amountReceived: 1200 }, now);
    expect(i).toHaveLength(1);
    expect(i[0].level).toBe("warning");
  });
  it("valid payout has no issues", () => {
    expect(payoutIssues({ ...base, status: "PAID", approvedAt: d("2026-05-02T00:00Z"), paidAt: d("2026-05-05T00:00Z"), amountReceived: 800 }, now)).toEqual([]);
  });
});

describe("payout events", () => {
  const now = d("2026-06-10T00:00Z");
  const p = { requestedAt: d("2026-05-01T10:00Z"), approvedAt: d("2026-05-03T10:00Z"), paidAt: d("2026-05-06T10:00Z"), amountRequested: 1000, amountReceived: 800 };
  it("maps each status to the reached stages", () => {
    expect(payoutEventSpecs({ ...p, status: "PENDING" }, { now })).toEqual([]);
    expect(payoutEventSpecs({ ...p, status: "REQUESTED", approvedAt: null, paidAt: null }, { now }).map((e) => e.type)).toEqual(["PAYOUT_REQUESTED"]);
    const paid = payoutEventSpecs({ ...p, status: "PAID" }, { now });
    expect(paid.map((e) => e.type)).toEqual(["PAYOUT_REQUESTED", "PAYOUT_APPROVED", "PAYOUT_RECEIVED"]);
    expect(paid[2]).toMatchObject({ amount: 800, occurredAt: p.paidAt });
  });
  it("rejections keep an existing date", () => {
    const at = d("2026-05-02T09:00Z");
    const r = payoutEventSpecs({ ...p, status: "REJECTED", approvedAt: null, paidAt: null }, { now, existing: { PAYOUT_REJECTED: at } });
    expect(r.map((e) => [e.type, e.occurredAt.toISOString()])).toEqual([
      ["PAYOUT_REQUESTED", p.requestedAt.toISOString()],
      ["PAYOUT_REJECTED", at.toISOString()],
    ]);
  });
  it("account moves to payout received only on first PAID of a funded account", () => {
    expect(shouldMarkAccountReceived("APPROVED", "PAID", "FUNDED")).toBe(true);
    expect(shouldMarkAccountReceived(null, "PAID", "PAYOUT_ELIGIBLE")).toBe(true);
    expect(shouldMarkAccountReceived("PAID", "PAID", "FUNDED")).toBe(false);
    expect(shouldMarkAccountReceived("REQUESTED", "PAID", "CHALLENGE")).toBe(false);
    expect(shouldMarkAccountReceived("REQUESTED", "APPROVED", "FUNDED")).toBe(false);
  });
});

describe("payout stats", () => {
  const item = (id: string, status: PayoutStatItem["status"], received: number | null, paidAt: string | null, firm = "f1", requested = 1000): PayoutStatItem => ({
    id,
    status,
    received,
    requested,
    paidAt: paidAt ? d(paidAt) : null,
    requestedAt: null,
    firmKey: firm,
    firmName: firm.toUpperCase(),
  });
  it("totals, periods, pending, firms and continuous months", () => {
    const s = computePayoutStats(
      [
        item("a", "PAID", 800.1, "2026-03-15T12:00Z"),
        item("b", "PAID", 200.2, "2026-05-02T12:00Z", "f2"),
        item("c", "PAID", 500, "2026-09-02T12:00Z"),
        item("d", "REQUESTED", null, null, "f2", 300),
        item("e", "REJECTED", null, null),
        item("x", "PAID", null, "2026-09-03T12:00Z"), // missing FX → excluded
      ],
      { timezone: "UTC", now: d("2026-09-20T00:00Z") },
    );
    expect(s.totalReceived).toBe(1500.3);
    expect(s.thisMonth).toBe(500);
    expect(s.thisYear).toBe(1500.3);
    expect(s.paidCount).toBe(3);
    expect(s.largest).toBe(800.1);
    expect(s.average).toBe(500.1);
    expect(s.pendingAmount).toBe(300);
    expect(s.pendingCount).toBe(1);
    expect(s.rejectedCount).toBe(1);
    expect(s.byFirm.map((f) => [f.key, f.received, f.pending])).toEqual([
      ["f1", 1300.1, 0],
      ["f2", 200.2, 300],
    ]);
    expect(s.monthly.map((m) => m.month)).toEqual(["2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"]);
    expect(s.monthly.at(-1)!.cumulative).toBe(1500.3);
    expect(s.monthly[1].received).toBe(0);
  });
  it("empty input", () => {
    const s = computePayoutStats([], { timezone: "UTC", now: d("2026-09-20T00:00Z") });
    expect(s).toMatchObject({ totalReceived: 0, average: null, largest: null, monthly: [] });
  });
});

describe("risk summaries", () => {
  const trades = [
    { id: "a", day: "2026-03-02", riskPercent: 0.5, initialRisk: 50 },
    { id: "b", day: "2026-03-02", riskPercent: 1.2, initialRisk: 120 },
    { id: "c", day: "2026-03-03", riskPercent: null, initialRisk: null },
    { id: "d", day: "2026-03-03", riskPercent: 1, initialRisk: 100.1 },
  ];
  it("averages and maxima skip trades without a stop", () => {
    expect(summarizeRisk(trades)).toEqual({ trades: 4, withRiskPct: 3, withRiskAmount: 3, avgRiskPct: 0.9, maxRiskPct: 1.2, avgRiskAmount: 90.0333, maxRiskAmount: 120 });
  });
  it("histogram inserts the rule limit as an edge", () => {
    const h = riskPctHistogram([0.1, 0.5, 1, 1.2, 5], 1.2);
    expect(h.reduce((a, b) => a + b.count, 0)).toBe(5);
    const over = h.filter((b) => b.overLimit).reduce((a, b) => a + b.count, 0);
    expect(over).toBe(1); // only 5 — a trade exactly at the limit is within it, as in countExceeding
    expect(over).toBe(countExceeding([0.1, 0.5, 1, 1.2, 5], 1.2).exceeded);
    expect(h[0]).toMatchObject({ label: "≤ 0.25%", count: 1 });
    expect(h.find((b) => b.label === "0.75%–1%")?.count).toBe(1);
    expect(h.find((b) => b.label === "1%–1.2%")?.count).toBe(1);
    expect(h.at(-1)).toMatchObject({ label: "> 3%", count: 1, overLimit: true });
  });
  it("daily risk sums initial risk per day", () => {
    expect(dailyRiskSeries(trades)).toEqual([
      { day: "2026-03-02", trades: 2, totalRisk: 170, totalRiskPct: 1.7, withoutRisk: 0 },
      { day: "2026-03-03", trades: 2, totalRisk: 100.1, totalRiskPct: 1, withoutRisk: 1 },
    ]);
  });
  it("counts rule breaches", () => {
    expect(countExceeding([0.5, 1, 1.0000000001, 1.5, null], 1)).toEqual({ exceeded: 1, measured: 4, pct: 25 });
    expect(samplesNeeded(12, 20)).toBe(8);
    expect(samplesNeeded(30, 20)).toBe(0);
    expect(strictestLimit([2, null, 1, 0, undefined])).toBe(1);
    expect(strictestLimit([null])).toBeNull();
  });
});

describe("prop rule tones", () => {
  it("allowance tone thresholds", () => {
    expect(allowanceTone(null)).toBe("off");
    expect(allowanceTone({ remaining: 0, remainingPct: 0 })).toBe("breach");
    expect(allowanceTone({ remaining: 10, remainingPct: 10 })).toBe("warning");
    expect(allowanceTone({ remaining: 400, remainingPct: 80 })).toBe("ok");
  });
  it("maps account state to tones", () => {
    const t = propRuleTones({
      profitTarget: { reached: true },
      dailyLoss: { remaining: 300, remainingPct: 60 },
      overallLoss: { remaining: -5, remainingPct: 0 },
      minTradingDays: { met: false },
      consistency: { passes: false },
      payout: { eligible: true, threshold: 100, frequencyDays: 14 },
      hasPayoutRules: true,
      weekendHoldingAllowed: false,
      newsTradingAllowed: false,
      maxPositionSize: 5,
      violations: { WEEKEND_HOLDING: 1 },
    });
    expect(t).toEqual({ profitTarget: "met", dailyLoss: "ok", maxLoss: "breach", minDays: "ok", consistency: "warning", payout: "met", weekend: "warning", positionSize: "ok", news: "unchecked" });
  });
});
