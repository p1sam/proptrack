import { describe, expect, it } from "vitest";
import { daysInMonth, isDayKey, isMonthKey, monthBounds, monthWeeks, shiftMonth, yearMonths } from "@/lib/calc/calendar";
import { alignCumulative, downsample, lastPerBucket } from "@/lib/calc/compare";

describe("calendar keys", () => {
  it("validates month and day keys", () => {
    expect(isMonthKey("2026-06")).toBe(true);
    expect(isMonthKey("2026-13")).toBe(false);
    expect(isMonthKey("2026-6")).toBe(false);
    expect(isDayKey("2026-02-28")).toBe(true);
    expect(isDayKey("2026-02-30")).toBe(false);
    expect(isDayKey("2028-02-29")).toBe(true);
  });
  it("shifts months across years", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-06", 0)).toBe("2026-06");
  });
  it("month bounds and lengths", () => {
    expect(daysInMonth("2026-02")).toBe(28);
    expect(monthBounds("2026-06")).toEqual({ from: "2026-06-01", to: "2026-06-30" });
    expect(yearMonths(2026)).toHaveLength(12);
  });
});

describe("monthWeeks", () => {
  it("splits a month into Monday-first grid rows and totals each", () => {
    // June 2026 starts on a Monday and ends on a Tuesday → 5 rows.
    const weeks = monthWeeks("2026-06", [
      { day: "2026-06-01", pnl: 100.1, trades: 2 },
      { day: "2026-06-03", pnl: -40.2, trades: 1 },
      { day: "2026-06-08", pnl: 0, trades: 1 },
      { day: "2026-06-30", pnl: 10, trades: 1 },
      { day: "2026-07-01", pnl: 999, trades: 9 }, // outside month
    ]);
    expect(weeks.map((w) => [w.start, w.end])).toEqual([
      ["2026-06-01", "2026-06-07"],
      ["2026-06-08", "2026-06-14"],
      ["2026-06-15", "2026-06-21"],
      ["2026-06-22", "2026-06-28"],
      ["2026-06-29", "2026-06-30"],
    ]);
    expect(weeks[0]).toMatchObject({ pnl: 59.9, trades: 3, tradingDays: 2, winningDays: 1, losingDays: 1 });
    expect(weeks[1]).toMatchObject({ pnl: 0, trades: 1, tradingDays: 1, winningDays: 0, losingDays: 0 });
    expect(weeks[4]).toMatchObject({ pnl: 10, trades: 1 });
  });
  it("handles a month starting on Sunday", () => {
    // March 2026 starts on a Sunday: first row is just the 1st.
    const weeks = monthWeeks("2026-03", []);
    expect(weeks[0]).toMatchObject({ start: "2026-03-01", end: "2026-03-01", pnl: 0, tradingDays: 0 });
    expect(weeks[1].start).toBe("2026-03-02");
    expect(weeks.at(-1)!.end).toBe("2026-03-31");
  });
});

describe("compare helpers", () => {
  it("keeps the last value per bucket", () => {
    expect(lastPerBucket([{ d: "a", v: 1 }, { d: "a", v: 2 }, { d: "b", v: 5 }], (p) => p.d, (p) => p.v)).toEqual([
      { x: "a", value: 2 },
      { x: "b", value: 5 },
    ]);
  });
  it("aligns cumulative series with zero start and forward fill", () => {
    const rows = alignCumulative([
      { key: "s1", points: [{ x: "2026-01-02", value: 10 }, { x: "2026-01-04", value: 5 }] },
      { key: "s2", points: [{ x: "2026-01-03", value: -3 }] },
    ]);
    expect(rows).toEqual([
      { x: "2026-01-02", values: { s1: 10, s2: 0 } },
      { x: "2026-01-03", values: { s1: 10, s2: -3 } },
      { x: "2026-01-04", values: { s1: 5, s2: -3 } },
    ]);
  });
  it("downsamples keeping endpoints", () => {
    const pts = Array.from({ length: 101 }, (_, i) => i);
    const d = downsample(pts, 11);
    expect(d).toHaveLength(11);
    expect(d[0]).toBe(0);
    expect(d.at(-1)).toBe(100);
    expect(downsample([1, 2, 3], 10)).toEqual([1, 2, 3]);
  });
});
