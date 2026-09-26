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
