import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { computeTrade } from "@/lib/calc/trade";
import { detectFileAdapter } from "@/lib/import/adapters";
import { parseCsv } from "@/lib/import/csv";
import { detectDateFormat } from "@/lib/import/dates";
import { detectDecimalSeparator } from "@/lib/import/numbers";
import { findFileDuplicates } from "@/lib/import/duplicates";
import { summarize } from "@/lib/import/normalize";

const text = readFileSync(path.join(__dirname, "fixtures/mt5-positions.csv"), "utf8");

describe("MetaTrader 5 positions fixture", () => {
  const table = parseCsv(text);
  const adapter = detectFileAdapter(table.headers);
  const mapping = adapter.suggestMapping(table.headers, table.rows.slice(0, 20));
  const rows = adapter.parse({ table, mapping, options: { timeZone: "Europe/Athens", dateFormat: "auto", decimal: ".", profitIsNet: false, ...adapter.defaults } });

  it("finds the header after the report preamble and stops before the Orders section", () => {
    expect(table.headerRow).toBe(6);
    expect(table.headers[0]).toBe("Time");
    expect(table.rows).toHaveLength(6);
    expect(table.notes.join(" ")).toMatch(/Orders/);
  });

  it("is detected as the MT5 preset with gross profit", () => {
    expect(adapter.id).toBe("mt5-positions-csv");
    expect(adapter.defaults.profitIsNet).toBe(false);
    expect(detectDateFormat(table.rows.map((r) => r[0])).format).toBe("ymd");
    expect(detectDecimalSeparator(table.rows.map((r) => r[5]))).toBe(".");
  });

  it("normalizes every position", () => {
    expect(summarize(rows)).toMatchObject({ total: 6, error: 0, skipped: 0 });
    const trades = rows.map((r) => r.trade!);
    expect(trades.map((t) => [t.symbol, t.direction])).toEqual([
      ["EURUSD", "LONG"],
      ["XAUUSD", "SHORT"],
      ["GBPUSD", "SHORT"],
      ["US30.CASH", "LONG"],
      ["USDJPY", "LONG"],
      ["EURUSD", "SHORT"],
    ]);
    const [eur, xau, gbp, , jpy, big] = trades;
    // Athens is UTC+2 in winter (EET) until 31 March
    expect(eur.openedAt.toISOString()).toBe("2024-03-11T07:15:22.000Z");
    expect(eur.closedAt!.toISOString()).toBe("2024-03-11T09:02:05.000Z");
    expect(eur).toMatchObject({ entryPrice: 1.09412, exitPrice: 1.0965, quantity: 1, stopLoss: 1.09212, takeProfit: 1.09812, commission: 7, swap: 0, grossPnl: 238, externalId: "50012345" });
    expect(xau).toMatchObject({ takeProfit: null, grossPnl: 367.5, commission: 3.5 });
    expect(gbp).toMatchObject({ swap: -11.36, grossPnl: -400 });
    expect(jpy).toMatchObject({ stopLoss: null, swap: 1.85 });
    expect(big).toMatchObject({ quantity: 10, stopLoss: null, takeProfit: null, grossPnl: 5000 });
  });

  it("net P&L equals profit − commission + swap for each position", () => {
    const nets = rows.map((r) => {
      const t = r.trade!;
      return computeTrade({ direction: t.direction, entryPrice: t.entryPrice, quantity: t.quantity, pointValue: 1, exits: [{ price: t.exitPrice!, quantity: t.quantity }], commission: t.commission, swap: t.swap, reportedGrossPnl: t.grossPnl }).netPnl;
    });
    expect(nets).toEqual([231, 364, -425.36, -62.5, 105.2, 5000]);
  });

  it("has no in-file duplicates", () => {
    const cands = rows.map((r) => ({ row: r.rowIndex, ...r.trade! }));
    expect(findFileDuplicates("acc", cands)).toEqual([]);
  });
});
