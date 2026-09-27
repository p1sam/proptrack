import { describe, expect, it } from "vitest";
import { DEFAULT_SESSIONS } from "@/lib/calc/sessions";
import { currenciesMissingRate, shiftMinute, timeZoneList, utcOffsetMinutes, windowSegments, winnerTimeline } from "@/components/settings/logic";
import { preferencesSchema, sessionSchema, exchangeRateSchema, instrumentSchema } from "@/lib/validation/settings";

const JAN = new Date("2026-01-15T12:00:00Z");
const JUL = new Date("2026-07-15T12:00:00Z");

describe("utcOffsetMinutes / shiftMinute", () => {
  it("handles DST", () => {
    expect(utcOffsetMinutes(JAN, "America/New_York")).toBe(-300);
    expect(utcOffsetMinutes(JUL, "America/New_York")).toBe(-240);
    expect(utcOffsetMinutes(JUL, "UTC")).toBe(0);
    expect(utcOffsetMinutes(JAN, "Asia/Kolkata")).toBe(330);
  });
  it("shifts wall-clock minutes between zones and wraps", () => {
    expect(shiftMinute(8 * 60, "America/New_York", "UTC", JAN)).toBe(13 * 60);
    expect(shiftMinute(8 * 60, "America/New_York", "UTC", JUL)).toBe(12 * 60);
    expect(shiftMinute(22 * 60, "America/New_York", "UTC", JAN)).toBe(3 * 60);
    expect(shiftMinute(90, "UTC", "UTC", JAN)).toBe(90);
  });
});

describe("windowSegments", () => {
  it("splits midnight wraps", () => {
    expect(windowSegments(60, 120)).toEqual([{ start: 60, end: 120 }]);
    expect(windowSegments(19 * 60, 3 * 60)).toEqual([
      { start: 1140, end: 1440 },
      { start: 0, end: 180 },
    ]);
    expect(windowSegments(1200, 0)).toEqual([{ start: 1200, end: 1440 }]);
    expect(windowSegments(0, 0)).toEqual([{ start: 0, end: 1440 }]);
  });
});

describe("winnerTimeline", () => {
  const sessions = DEFAULT_SESSIONS.map((s, i) => ({ ...s, id: s.name, isActive: true, priority: s.priority ?? i }));
  it("first match by priority wins (overlap above London/NY)", () => {
    const t = winnerTimeline(sessions, "America/New_York", JAN);
    const at = (m: number) => t.find((s) => m >= s.start && m < s.end)?.id;
    expect(at(2 * 60)).toBe("Asian");
    expect(at(5 * 60)).toBe("London");
    expect(at(9 * 60)).toBe("London/NY Overlap");
    expect(at(13 * 60)).toBe("New York");
    expect(at(18 * 60)).toBeNull();
    expect(at(23 * 60)).toBe("Asian");
    // covers the whole day contiguously
    expect(t[0].start).toBe(0);
    expect(t.at(-1)!.end).toBe(1440);
    for (let i = 1; i < t.length; i++) expect(t[i].start).toBe(t[i - 1].end);
  });
  it("skips inactive sessions and respects priority changes", () => {
    const edited = sessions.map((s) => (s.name === "London/NY Overlap" ? { ...s, isActive: false } : s));
    const t = winnerTimeline(edited, "America/New_York", JAN);
    expect(t.find((s) => 9 * 60 >= s.start && 9 * 60 < s.end)?.id).toBe("London");
  });
  it("converts to the display timezone", () => {
    const t = winnerTimeline(sessions, "UTC", JAN);
    expect(t.find((s) => 14 * 60 >= s.start && 14 * 60 < s.end)?.id).toBe("London/NY Overlap");
  });
});

describe("currenciesMissingRate", () => {
  it("uses direct and inverse rates", () => {
    const rates = [{ base: "EUR", quote: "USD", rate: 1.08 }];
    expect(currenciesMissingRate(["USD", "EUR", "gbp", "GBP"], "USD", rates)).toEqual(["GBP"]);
    expect(currenciesMissingRate(["USD", "EUR"], "EUR", rates)).toEqual([]);
    expect(currenciesMissingRate(["CAD"], "EUR", rates)).toEqual(["CAD"]);
  });
});

describe("timeZoneList", () => {
  it("always includes UTC first and extra zones", () => {
    const z = timeZoneList(["Etc/GMT+5"]);
    expect(z[0]).toBe("UTC");
    expect(z).toContain("America/New_York");
    expect(z).toContain("Etc/GMT+5");
    expect(new Set(z).size).toBe(z.length);
  });
});

describe("settings schemas", () => {
  it("validates timezone and defaults", () => {
    const ok = preferencesSchema.safeParse({ defaultCurrency: "usd", timezone: "Europe/London", riskPercent: "0.5", maxTradesPerDay: "", maxDailyLossPct: "", defaultRR: "2", breakevenTolerance: "", insightMinTrades: "" });
    expect(ok.success && ok.data).toMatchObject({ defaultCurrency: "USD", riskPercent: 0.5, maxTradesPerDay: null, breakevenTolerance: 0, insightMinTrades: 20 });
    expect(preferencesSchema.safeParse({ defaultCurrency: "USD", timezone: "Mars/Olympus" }).success).toBe(false);
    expect(preferencesSchema.safeParse({ defaultCurrency: "USD", timezone: "UTC", maxTradesPerDay: "2.5" }).success).toBe(false);
  });
  it("parses session times with midnight wrap", () => {
    const r = sessionSchema.safeParse({ name: "Asia", timezone: "Asia/Tokyo", start: "22:00", end: "03:30", priority: "5", color: "" });
    expect(r.success && r.data).toMatchObject({ start: 1320, end: 210, priority: 5, color: null, isActive: true });
    expect(sessionSchema.safeParse({ name: "x", timezone: "UTC", start: "25:00", end: "01:00", priority: 1 }).success).toBe(false);
    expect(sessionSchema.safeParse({ name: "x", timezone: "UTC", start: "01:00", end: "01:00", priority: 1 }).success).toBe(false);
  });
  it("rejects bad rates and point values", () => {
    expect(exchangeRateSchema.safeParse({ base: "EUR", quote: "eur", rate: 1 }).success).toBe(false);
    expect(exchangeRateSchema.safeParse({ base: "EUR", quote: "USD", rate: "0" }).success).toBe(false);
    expect(instrumentSchema.safeParse({ symbol: "eurusd", pointValue: "" }).success).toBe(false);
    const ok = instrumentSchema.safeParse({ symbol: "eurusd", pointValue: "100000", tickSize: "" });
    expect(ok.success && ok.data).toMatchObject({ symbol: "EURUSD", pointValue: 100000, tickSize: null, assetClass: "OTHER" });
  });
});
