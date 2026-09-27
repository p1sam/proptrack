import { describe, expect, it } from "vitest";
import { detectDecimalSeparator, parseNumber } from "@/lib/import/numbers";

describe("parseNumber", () => {
  it("parses plain and signed numbers", () => {
    expect(parseNumber("1234.56")).toBe(1234.56);
    expect(parseNumber("-12.5")).toBe(-12.5);
    expect(parseNumber("+7")).toBe(7);
    expect(parseNumber(".5")).toBe(0.5);
    expect(parseNumber(42)).toBe(42);
  });
  it("handles thousands separators for both conventions", () => {
    expect(parseNumber("1,234.56", ".")).toBe(1234.56);
    expect(parseNumber("1,234,567.8", ".")).toBe(1234567.8);
    expect(parseNumber("1.234,56", ",")).toBe(1234.56);
    expect(parseNumber("1.234.567,8", ",")).toBe(1234567.8);
    expect(parseNumber("0,85", ",")).toBe(0.85);
  });
  it("handles spaces and apostrophes as grouping", () => {
    expect(parseNumber("5 000.00")).toBe(5000);
    expect(parseNumber("1 234,5", ",")).toBe(1234.5);
    expect(parseNumber("1'234.50")).toBe(1234.5);
  });
  it("parentheses and trailing minus are negative", () => {
    expect(parseNumber("(12.50)")).toBe(-12.5);
    expect(parseNumber("($1,200.00)")).toBe(-1200);
    expect(parseNumber("12.50-")).toBe(-12.5);
  });
  it("strips currency symbols and codes", () => {
    expect(parseNumber("$1,200.50")).toBe(1200.5);
    expect(parseNumber("-$5")).toBe(-5);
    expect(parseNumber("€ 3,20", ",")).toBe(3.2);
    expect(parseNumber("1200 USD")).toBe(1200);
    expect(parseNumber("£-7.25")).toBe(-7.25);
  });
  it("blank and dash cells are missing, garbage is NaN", () => {
    expect(parseNumber("")).toBeNull();
    expect(parseNumber("  ")).toBeNull();
    expect(parseNumber("-")).toBeNull();
    expect(parseNumber("N/A")).toBeNull();
    expect(parseNumber(null)).toBeNull();
    expect(parseNumber("abc")).toBeNaN();
    expect(parseNumber("12.3.4", ".")).toBeNaN();
  });
  it("rejects values that do not fit the chosen decimal separator", () => {
    expect(parseNumber("1234,5", ".")).toBeNaN();
    expect(parseNumber("0.10", ",")).toBeNaN();
  });
});

describe("detectDecimalSeparator", () => {
  it("detects dot and comma decimals", () => {
    expect(detectDecimalSeparator(["1.2345", "-12.50", "1,234.56"])).toBe(".");
    expect(detectDecimalSeparator(["1,2345", "-12,50", "1.234,56"])).toBe(",");
  });
  it("is ambiguous when only three-decimal groups appear", () => {
    expect(detectDecimalSeparator(["1,234", "5,000"])).toBe("ambiguous");
  });
  it("defaults to dot for integers", () => {
    expect(detectDecimalSeparator(["1", "20", "300"])).toBe(".");
  });
});
