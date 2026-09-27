import { describe, expect, it } from "vitest";
import { candidateFingerprint, findExistingDuplicates, findFileDuplicates, type DuplicateCandidate, type ExistingTradeLite } from "@/lib/import/duplicates";
import { tradeFingerprint } from "@/lib/import/fingerprint";

const A = "acc_1";
const at = (s: string) => new Date(`2024-03-15T${s}Z`);
const cand = (row: number, over: Partial<DuplicateCandidate> = {}): DuplicateCandidate => ({
  row,
  symbol: "EURUSD",
  direction: "LONG",
  openedAt: at("09:30:00"),
  closedAt: at("10:15:00"),
  entryPrice: 1.085,
  exitPrice: 1.0875,
  quantity: 1,
  ...over,
});
const existing = (id: string, over: Partial<ExistingTradeLite> = {}): ExistingTradeLite => ({ id, ...cand(0), ...over });

describe("findExistingDuplicates", () => {
  it("finds exact fingerprint matches (same minute, prices, size)", () => {
    const res = findExistingDuplicates(A, [cand(0, { openedAt: at("09:30:40") })], [existing("t1", { openedAt: at("09:30:05") })]);
    expect(res).toEqual([{ row: 0, kind: "exact", tradeId: "t1" }]);
  });
  it("matches the stored fingerprint of the existing trade", () => {
    const c = cand(0);
    const fp = tradeFingerprint({ accountId: A, ...c });
    const res = findExistingDuplicates(A, [c], [existing("t9", { symbol: "OTHER", fingerprint: fp })]);
    expect(res[0]).toMatchObject({ kind: "exact", tradeId: "t9" });
  });
  it("finds possible duplicates within 60 s across a minute boundary", () => {
    const res = findExistingDuplicates(A, [cand(0, { openedAt: at("09:30:50"), closedAt: at("10:15:50") })], [existing("t1", { openedAt: at("09:31:20"), closedAt: at("10:16:10") })]);
    expect(res).toEqual([{ row: 0, kind: "possible", tradeId: "t1" }]);
  });
  it("does not match beyond the tolerance or with different size / side / symbol / price", () => {
    const ex = [existing("t1")];
    expect(findExistingDuplicates(A, [cand(0, { openedAt: at("09:31:30"), closedAt: at("10:16:30") })], ex)).toEqual([]);
    expect(findExistingDuplicates(A, [cand(0, { quantity: 2 })], ex)).toEqual([]);
    expect(findExistingDuplicates(A, [cand(0, { direction: "SHORT" })], ex)).toEqual([]);
    expect(findExistingDuplicates(A, [cand(0, { symbol: "GBPUSD" })], ex)).toEqual([]);
    expect(findExistingDuplicates(A, [cand(0, { entryPrice: 1.086 })], ex)).toEqual([]);
  });
  it("symbol matching is case-insensitive", () => {
    expect(findExistingDuplicates(A, [cand(0, { symbol: "eurusd", openedAt: at("09:30:30") })], [existing("t1", { openedAt: at("09:29:59") })])[0]?.kind).toBe("possible");
  });
  it("ignores a stand-in exit price for the loose match", () => {
    const res = findExistingDuplicates(A, [cand(0, { openedAt: at("09:30:59"), exitPrice: 1.085, exitPriceKnown: false })], [existing("t1", { openedAt: at("09:31:10") })]);
    expect(res[0]).toMatchObject({ kind: "possible" });
  });
  it("scales to many trades (indexed lookup)", () => {
    const ex: ExistingTradeLite[] = Array.from({ length: 20000 }, (_, i) => existing(`t${i}`, { openedAt: new Date(Date.UTC(2024, 0, 1) + i * 120_000) }));
    const cs = Array.from({ length: 5000 }, (_, i) => cand(i, { openedAt: new Date(Date.UTC(2024, 0, 1) + i * 120_000 + 30_000), closedAt: null, exitPrice: null }));
    const t0 = performance.now();
    const res = findExistingDuplicates(A, cs, ex);
    // Generous bound: an O(n·m) scan would take far longer; the machine may be loaded.
    expect(performance.now() - t0).toBeLessThan(10_000);
    expect(res).toHaveLength(5000);
  }, 30_000);
});

describe("findFileDuplicates", () => {
  it("flags later repeats, never the first occurrence", () => {
    const rows = [cand(0), cand(1, { symbol: "GBPUSD" }), cand(2), cand(3, { openedAt: at("09:30:45") }), cand(4, { openedAt: at("09:31:20"), closedAt: at("10:15:30") })];
    expect(findFileDuplicates(A, rows)).toEqual([
      { row: 2, kind: "exact", ofRow: 0 },
      { row: 3, kind: "exact", ofRow: 0 },
      { row: 4, kind: "possible", ofRow: 0 },
    ]);
  });
  it("keeps distinct partial fills of different size", () => {
    expect(findFileDuplicates(A, [cand(0), cand(1, { quantity: 0.5 })])).toEqual([]);
  });
  it("candidate fingerprints equal the manual-trade fingerprint", () => {
    const c = cand(0);
    expect(candidateFingerprint(A, c)).toBe(tradeFingerprint({ accountId: A, ...c }));
  });
});
