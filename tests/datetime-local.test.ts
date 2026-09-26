import { describe, expect, it } from "vitest";
import { fromZonedLocalInput, toZonedLocalInput } from "@/lib/datetime-local";

describe("fromZonedLocalInput", () => {
  it("treats the value as wall-clock time in the given zone", () => {
    expect(fromZonedLocalInput("2025-01-15T09:30", "UTC")?.toISOString()).toBe("2025-01-15T09:30:00.000Z");
    expect(fromZonedLocalInput("2025-01-15T09:30", "America/New_York")?.toISOString()).toBe("2025-01-15T14:30:00.000Z");
    expect(fromZonedLocalInput("2025-07-15T09:30", "America/New_York")?.toISOString()).toBe("2025-07-15T13:30:00.000Z");
    expect(fromZonedLocalInput("2025-07-15T09:30", "Europe/London")?.toISOString()).toBe("2025-07-15T08:30:00.000Z");
    expect(fromZonedLocalInput("2025-01-15T09:30", "Asia/Kolkata")?.toISOString()).toBe("2025-01-15T04:00:00.000Z");
    expect(fromZonedLocalInput("2025-01-15T09:30:15", "Asia/Tokyo")?.toISOString()).toBe("2025-01-15T00:30:15.000Z");
  });

  it("crosses the date line correctly", () => {
    expect(fromZonedLocalInput("2025-03-01T00:15", "Pacific/Auckland")?.toISOString()).toBe("2025-02-28T11:15:00.000Z");
  });

  it("resolves the non-existent spring-forward hour forward by the gap", () => {
    // New York skips 02:00–03:00 on 2025-03-09.
    expect(fromZonedLocalInput("2025-03-09T02:30", "America/New_York")?.toISOString()).toBe("2025-03-09T07:30:00.000Z");
    expect(toZonedLocalInput(fromZonedLocalInput("2025-03-09T02:30", "America/New_York")!, "America/New_York")).toBe("2025-03-09T03:30");
  });

  it("resolves the repeated fall-back hour to the earlier instant", () => {
    // New York repeats 01:00–02:00 on 2025-11-02 (EDT first, then EST).
    expect(fromZonedLocalInput("2025-11-02T01:30", "America/New_York")?.toISOString()).toBe("2025-11-02T05:30:00.000Z");
    expect(fromZonedLocalInput("2025-10-26T01:30", "Europe/London")?.toISOString()).toBe("2025-10-26T00:30:00.000Z");
  });

  it("rejects malformed and impossible values", () => {
    for (const v of ["", "2025-01-15", "2025-13-01T00:00", "2025-02-31T10:00", "2025-01-15T24:00", "nonsense"]) {
      expect(fromZonedLocalInput(v, "UTC"), v).toBeNull();
    }
  });
});

describe("toZonedLocalInput", () => {
  it("formats an instant as wall-clock time", () => {
    expect(toZonedLocalInput(new Date("2025-01-15T14:30:00Z"), "America/New_York")).toBe("2025-01-15T09:30");
    expect(toZonedLocalInput("2025-07-15T08:30:00Z", "Europe/London")).toBe("2025-07-15T09:30");
  });

  it("round-trips every 37 minutes across a DST year", () => {
    const tz = "Europe/Berlin";
    for (let t = Date.UTC(2025, 0, 1); t < Date.UTC(2026, 0, 1); t += 37 * 60_000) {
      const d = new Date(t - (t % 60_000));
      const local = toZonedLocalInput(d, tz);
      const back = fromZonedLocalInput(local, tz)!;
      // The repeated autumn hour maps to its first occurrence; everything else is exact.
      expect(toZonedLocalInput(back, tz)).toBe(local);
    }
  });
});
