import { describe, expect, it } from "vitest";
import { addMoney, mulMoney, pctAmount, percentOf, roundMoney, safeDiv, sumMoney } from "@/lib/calc/money";

describe("money", () => {
  it("sums without floating-point drift", () => {
    expect(sumMoney([0.1, 0.2])).toBe(0.3);
    expect(sumMoney(Array(10).fill(0.1))).toBe(1);
    expect(addMoney(1.005, 2.0049)).toBe(3.0099);
  });
  it("rounds half away from zero", () => {
    expect(roundMoney(1.00005)).toBe(1.0001);
    expect(roundMoney(-1.00005)).toBe(-1.0001);
    expect(roundMoney(2.345, 2)).toBe(2.35);
    expect(roundMoney(-2.345, 2)).toBe(-2.35);
  });
  it("multiplies exactly", () => {
    expect(mulMoney(1.0875 - 1.085, 100000)).toBe(250);
    expect(mulMoney("0.0025", 100000, 1)).toBe(250);
  });
  it("computes percentages and guards division by zero", () => {
    expect(pctAmount(10000, 8)).toBe(800);
    expect(pctAmount(10000, 0.5)).toBe(50);
    expect(percentOf(420, 800)).toBe(52.5);
    expect(percentOf(1, 0)).toBeNull();
    expect(safeDiv(1, 0)).toBeNull();
  });
  it("ignores null/undefined in sums", () => {
    expect(sumMoney([1, null, undefined, 2])).toBe(3);
  });
});
