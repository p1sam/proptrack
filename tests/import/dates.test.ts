import { describe, expect, it } from "vitest";
import { detectDateFormat, parseDateTime, parseTimeOfDay, zonedWallTimeToUtc } from "@/lib/import/dates";

const iso = (raw: string, format: Parameters<typeof parseDateTime>[1]["format"] = "auto", timeZone = "UTC", timeRaw?: string) => {
  const r = parseDateTime(raw, { format, timeZone, timeRaw });
  if (!r.ok) throw new Error(r.error);
  return r.value.date.toISOString();
};

describe("parseDateTime formats", () => {
  it("ISO with and without seconds / T separator", () => {
    expect(iso("2024-03-15 14:30:05")).toBe("2024-03-15T14:30:05.000Z");
    expect(iso("2024-03-15T14:30")).toBe("2024-03-15T14:30:00.000Z");
    expect(iso("2024-03-15T14:30:05.250")).toBe("2024-03-15T14:30:05.250Z");
  });
  it("respects explicit offsets over the file timezone", () => {
    expect(iso("2024-03-15T14:30:00Z", "auto", "America/New_York")).toBe("2024-03-15T14:30:00.000Z");
    expect(iso("2024-03-15T14:30:00+02:00", "auto", "America/New_York")).toBe("2024-03-15T12:30:00.000Z");
    expect(iso("2024-03-15 14:30:00 -0500")).toBe("2024-03-15T19:30:00.000Z");
    expect(iso("2024-03-15 14:30 UTC", "auto", "Asia/Tokyo")).toBe("2024-03-15T14:30:00.000Z");
    expect(iso("2024-03-15 14:30 GMT+3")).toBe("2024-03-15T11:30:00.000Z");
  });
  it("MetaTrader dotted dates", () => {
    expect(iso("2024.03.15 14:30:05", "ymd")).toBe("2024-03-15T14:30:05.000Z");
    expect(iso("2024.03.15 14:30")).toBe("2024-03-15T14:30:00.000Z");
  });
  it("US and EU orders with an explicit choice", () => {
    expect(iso("03/04/2024 09:00", "mdy")).toBe("2024-03-04T09:00:00.000Z");
    expect(iso("03/04/2024 09:00", "dmy")).toBe("2024-04-03T09:00:00.000Z");
    expect(iso("15.03.2024 09:00", "dmy")).toBe("2024-03-15T09:00:00.000Z");
    expect(iso("3/15/24 2:05 PM", "mdy")).toBe("2024-03-15T14:05:00.000Z");
  });
  it("auto resolves unambiguous day/month and rejects ambiguous ones", () => {
    expect(iso("15/03/2024 10:00")).toBe("2024-03-15T10:00:00.000Z");
    expect(iso("03/15/2024 10:00")).toBe("2024-03-15T10:00:00.000Z");
    const r = parseDateTime("03/04/2024", { format: "auto", timeZone: "UTC" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Ambiguous/);
  });
  it("month names", () => {
    expect(iso("15 Mar 2024 10:00")).toBe("2024-03-15T10:00:00.000Z");
    expect(iso("Mar 15, 2024 10:00:30")).toBe("2024-03-15T10:00:30.000Z");
    expect(iso("15-Sept-2024")).toBe("2024-09-15T00:00:00.000Z");
  });
  it("separate date and time columns", () => {
    expect(iso("2024-03-15", "auto", "UTC", "09:45:10")).toBe("2024-03-15T09:45:10.000Z");
    const r = parseDateTime("2024-03-15", { format: "auto", timeZone: "UTC" });
    expect(r.ok && r.value.dateOnly).toBe(true);
  });
  it("Excel serial numbers", () => {
    expect(iso("45366.5", "excel")).toBe("2024-03-15T12:00:00.000Z");
    expect(iso("45366", "auto")).toBe("2024-03-15T00:00:00.000Z");
  });
  it("rejects invalid dates and times", () => {
    expect(parseDateTime("2024-02-30 10:00", { format: "auto", timeZone: "UTC" }).ok).toBe(false);
    expect(parseDateTime("2024-03-15 25:00", { format: "auto", timeZone: "UTC" }).ok).toBe(false);
    expect(parseDateTime("yesterday", { format: "auto", timeZone: "UTC" }).ok).toBe(false);
    expect(parseDateTime("2024-03-15 10:00", { format: "auto", timeZone: "Mars/Olympus" }).ok).toBe(false);
  });
});

describe("timezone conversion", () => {
  it("converts wall time in a zone to UTC", () => {
    expect(iso("2024-01-15 09:30", "auto", "America/New_York")).toBe("2024-01-15T14:30:00.000Z"); // EST −5
    expect(iso("2024-07-15 09:30", "auto", "America/New_York")).toBe("2024-07-15T13:30:00.000Z"); // EDT −4
    expect(iso("2024.07.15 16:30", "ymd", "Europe/Athens")).toBe("2024-07-15T13:30:00.000Z"); // EEST +3
    expect(iso("2024.01.15 16:30", "ymd", "Europe/Athens")).toBe("2024-01-15T14:30:00.000Z"); // EET +2
    expect(iso("2024-03-15 09:00", "auto", "Asia/Kolkata")).toBe("2024-03-15T03:30:00.000Z"); // +5:30
    expect(iso("2024-03-15 09:00", "auto", "Etc/GMT-2")).toBe("2024-03-15T07:00:00.000Z");
  });
  it("handles the US spring-forward gap (02:30 does not exist → 03:30 EDT)", () => {
    const d = zonedWallTimeToUtc({ year: 2024, month: 3, day: 10, hour: 2, minute: 30, second: 0, ms: 0 }, "America/New_York");
    expect(d.toISOString()).toBe("2024-03-10T07:30:00.000Z");
    // Just before and after the jump
    expect(iso("2024-03-10 01:59", "auto", "America/New_York")).toBe("2024-03-10T06:59:00.000Z");
    expect(iso("2024-03-10 03:00", "auto", "America/New_York")).toBe("2024-03-10T07:00:00.000Z");
  });
  it("resolves the fall-back overlap to the earlier instant", () => {
    expect(iso("2024-11-03 01:30", "auto", "America/New_York")).toBe("2024-11-03T05:30:00.000Z");
    expect(iso("2024-11-03 02:30", "auto", "America/New_York")).toBe("2024-11-03T07:30:00.000Z");
  });
  it("handles the EU transition (last Sunday of March)", () => {
    expect(iso("2024-03-31 00:30", "auto", "Europe/London")).toBe("2024-03-31T00:30:00.000Z"); // GMT
    expect(iso("2024-03-31 01:30", "auto", "Europe/London")).toBe("2024-03-31T01:30:00.000Z"); // gap → 02:30 BST
    expect(iso("2024-03-31 02:30", "auto", "Europe/London")).toBe("2024-03-31T01:30:00.000Z"); // BST +1
    expect(iso("2024-03-31 03:30", "auto", "Europe/London")).toBe("2024-03-31T02:30:00.000Z");
  });
});

describe("parseTimeOfDay", () => {
  it("parses 24h and 12h clocks", () => {
    expect(parseTimeOfDay("09:05")).toEqual({ hour: 9, minute: 5, second: 0, ms: 0 });
    expect(parseTimeOfDay("12:00 AM")?.hour).toBe(0);
    expect(parseTimeOfDay("12:30 pm")?.hour).toBe(12);
    expect(parseTimeOfDay("1:15:30 p.m.")).toEqual({ hour: 13, minute: 15, second: 30, ms: 0 });
    expect(parseTimeOfDay("24:30")).toBeNull();
  });
});

describe("detectDateFormat", () => {
  it("detects year-first, day-first, month-first, excel", () => {
    expect(detectDateFormat(["2024.03.15 10:00", "2024.03.16 11:00"])).toEqual({ format: "ymd", ambiguous: false });
    expect(detectDateFormat(["03/04/2024", "25/04/2024"])).toEqual({ format: "dmy", ambiguous: false });
    expect(detectDateFormat(["03/04/2024", "04/25/2024"])).toEqual({ format: "mdy", ambiguous: false });
    expect(detectDateFormat(["45366.5", "45367.25"])).toEqual({ format: "excel", ambiguous: false });
  });
  it("flags ambiguous samples", () => {
    expect(detectDateFormat(["03/04/2024", "05/06/2024"]).ambiguous).toBe(true);
  });
});
