import { describe, expect, it } from "vitest";
import { dayKey, inMinuteWindow, minuteOfDay, parseHHMM, spansWeekend } from "@/lib/calc/time";
import { assignSession, DEFAULT_SESSIONS } from "@/lib/calc/sessions";

describe("time", () => {
  it("day keys respect timezone", () => {
    const d = new Date("2026-03-02T23:30:00Z");
    expect(dayKey(d, "UTC")).toBe("2026-03-02");
    expect(dayKey(d, "Asia/Tokyo")).toBe("2026-03-03");
    expect(dayKey(d, "America/New_York")).toBe("2026-03-02");
  });
  it("reset hour rolls the day forward, DST-safe", () => {
    // 17:30 ET in winter (EST) and in summer (EDT)
    expect(dayKey(new Date("2026-01-05T22:30:00Z"), "America/New_York", 17)).toBe("2026-01-06");
    expect(dayKey(new Date("2026-07-06T21:30:00Z"), "America/New_York", 17)).toBe("2026-07-07");
    expect(dayKey(new Date("2026-07-06T20:30:00Z"), "America/New_York", 17)).toBe("2026-07-06");
  });
  it("minute windows wrap midnight", () => {
    expect(inMinuteWindow(23 * 60, 19 * 60, 3 * 60)).toBe(true);
    expect(inMinuteWindow(2 * 60, 19 * 60, 3 * 60)).toBe(true);
    expect(inMinuteWindow(4 * 60, 19 * 60, 3 * 60)).toBe(false);
    expect(minuteOfDay(new Date("2026-01-05T14:45:00Z"), "America/New_York")).toBe(9 * 60 + 45);
  });
  it("weekend spans", () => {
    expect(spansWeekend(new Date("2026-03-06T20:00:00Z"), new Date("2026-03-09T14:00:00Z"), "UTC")).toBe(true);
    expect(spansWeekend(new Date("2026-03-02T10:00:00Z"), new Date("2026-03-04T10:00:00Z"), "UTC")).toBe(false);
  });
  it("parses HH:MM", () => {
    expect(parseHHMM("08:30")).toBe(510);
    expect(parseHHMM("24:00")).toBeNull();
  });
});

describe("sessions", () => {
  const defs = DEFAULT_SESSIONS.map((s, i) => ({ ...s, id: String(i) }));
  it("overlap wins by priority; DST handled via New York time", () => {
    expect(assignSession(new Date("2026-01-05T14:00:00Z"), defs)?.name).toBe("London/NY Overlap"); // 09:00 EST
    expect(assignSession(new Date("2026-07-06T13:00:00Z"), defs)?.name).toBe("London/NY Overlap"); // 09:00 EDT
    expect(assignSession(new Date("2026-01-05T09:00:00Z"), defs)?.name).toBe("London"); // 04:00 EST
    expect(assignSession(new Date("2026-01-05T18:00:00Z"), defs)?.name).toBe("New York"); // 13:00 EST
    expect(assignSession(new Date("2026-01-05T02:00:00Z"), defs)?.name).toBe("Asian"); // 21:00 EST
    expect(assignSession(new Date("2026-01-05T23:00:00Z"), defs)).toBeNull(); // 18:00 EST gap
  });
});

describe("offset-cached zoned parts", () => {
  it("matches Intl across DST transitions", async () => {
    const { zonedParts } = await import("@/lib/calc/time");
    const fmt = (d: Date, tz: string) => {
      const p = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(d);
      const g = (t: string) => Number(p.find((x) => x.type === t)!.value);
      return [g("year"), g("month"), g("day"), g("hour"), g("minute")];
    };
    const zones = ["America/New_York", "Europe/London", "Australia/Lord_Howe", "Asia/Kolkata", "UTC"];
    // Walk 3 days around the 2026 US and EU DST switches in 7-minute steps.
    for (const start of ["2026-03-07T00:00:00Z", "2026-03-28T00:00:00Z", "2026-10-31T00:00:00Z", "2026-04-04T00:00:00Z"]) {
      for (let m = 0; m < 3 * 1440; m += 7) {
        const d = new Date(new Date(start).getTime() + m * 60_000);
        for (const tz of zones) {
          const z = zonedParts(d, tz);
          expect([z.year, z.month, z.day, z.hour, z.minute]).toEqual(fmt(d, tz));
        }
      }
    }
  });
});
