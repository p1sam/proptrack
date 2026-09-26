import { describe, expect, it } from "vitest";
import { calculateAccountROI, calculatePassRate, calculatePayoutROI, computeAccountEconomics, netFees, payoutsReceived } from "@/lib/calc/economics";
import { buildFxTable, convertAmount, sumConverted } from "@/lib/calc/fx";
import { collapseCopies } from "@/lib/calc/copies";

describe("economics", () => {
  it("spec example: $80 fee, $600 payouts → +$520", () => {
    const e = computeAccountEconomics([{ amount: 80 }], [{ status: "PAID", amountReceived: 600 }, { status: "REQUESTED", amountReceived: null }]);
    expect(e).toEqual({ fees: 80, payouts: 600, netCashFlow: 520, roiPct: 650, payoutMultiple: 7.5 });
  });
  it("refunds reduce fees; only PAID counts", () => {
    expect(netFees([{ amount: 155, refunded: 155 }, { amount: 80 }])).toBe(80);
    expect(payoutsReceived([{ status: "APPROVED", amountReceived: 500 }])).toBe(0);
  });
  it("ROI helpers", () => {
    expect(calculateAccountROI(3100, 480)).toBeCloseTo(545.833333, 5);
    expect(calculatePayoutROI(3100, 480)).toBeCloseTo(6.4583, 4);
    expect(calculateAccountROI(100, 0)).toBeNull();
    expect(calculatePassRate(2, 3)).toBe(40);
  });
});

describe("fx", () => {
  const table = buildFxTable([{ base: "EUR", quote: "USD", rate: 1.08 }]);
  it("converts both directions", () => {
    expect(convertAmount(100, "EUR", "USD", table)).toBe(108);
    expect(convertAmount(108, "USD", "EUR", table)).toBe(100);
    expect(convertAmount(5, "usd", "USD", table)).toBe(5);
  });
  it("reports missing currencies instead of summing them", () => {
    const r = sumConverted([{ amount: 100, currency: "USD" }, { amount: 100, currency: "EUR" }, { amount: 100, currency: "GBP" }], "USD", table);
    expect(r).toEqual({ total: 208, missing: ["GBP"] });
  });
});

describe("collapseCopies", () => {
  const base = (id: string, groupId: string | null, netPnl: number, r: number, open: number) => ({
    id,
    groupId,
    netPnl,
    rMultiple: r,
    openedAt: new Date(open),
    closedAt: new Date(open + 60_000),
  });
  it("counts a copied idea once, sums money, averages R", () => {
    const out = collapseCopies([base("a", "g", 100, 1, 1000), base("b", "g", 200, 1, 2000), base("c", "g", 50.5, 1.02, 1500), base("d", null, -40, -1, 5000)]);
    expect(out).toHaveLength(2);
    const g = out.find((x) => x.copies === 3)!;
    expect(g.id).toBe("a");
    expect(g.netPnl).toBe(350.5);
    expect(g.rMultiple).toBeCloseTo(1.0067, 4);
    expect(g.memberIds.sort()).toEqual(["a", "b", "c"]);
  });
});
