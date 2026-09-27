import { describe, expect, it } from "vitest";
import { detectDelimiter, parseCsv } from "@/lib/import/csv";
import { autoMap, headerKeys, validateMapping, type ColumnMapping } from "@/lib/import/fields";
import { detectFileAdapter } from "@/lib/import/adapters";

const named = (headers: string[], m: ColumnMapping) =>
  Object.fromEntries(Object.entries(m).filter(([, v]) => v !== null).map(([k, v]) => [k, headers[v as number]]));

describe("parseCsv", () => {
  it("detects comma, semicolon, tab and pipe delimiters", () => {
    expect(detectDelimiter("Symbol,Side,Price\nEURUSD,buy,1.1\n")).toBe(",");
    expect(detectDelimiter("Symbol;Side;Price\nEURUSD;buy;1,1\nGBPUSD;sell;1,25\n")).toBe(";");
    expect(detectDelimiter("Symbol\tSide\tPrice\nEURUSD\tbuy\t1.1\n")).toBe("\t");
    expect(detectDelimiter("Symbol|Side|Price\nEURUSD|buy|1.1\n")).toBe("|");
  });
  it("prefers semicolon when commas are decimal separators", () => {
    const t = parseCsv("Date;Symbol;Side;Qty;Entry;Exit;Profit\n2024-03-15 10:00;DAX;buy;1;17850,5;17910,25;59,75\n2024-03-15 11:00;DAX;sell;1;17900,5;17880,25;20,25\n");
    expect(t.delimiter).toBe(";");
    expect(t.headers).toHaveLength(7);
    expect(t.rows[0][4]).toBe("17850,5");
  });
  it("strips the BOM and handles quoted fields with delimiters, quotes and newlines", () => {
    const t = parseCsv('﻿Symbol,Notes,Profit\n"EURUSD","breakout, retest","1,234.50"\n"GBPUSD","said ""hi""\nsecond line","-5"\n');
    expect(t.headers).toEqual(["Symbol", "Notes", "Profit"]);
    expect(t.rows[0]).toEqual(["EURUSD", "breakout, retest", "1,234.50"]);
    expect(t.rows[1][1]).toBe('said "hi"\nsecond line');
  });
  it("skips preamble lines, blank lines, repeated headers; stops at a new section", () => {
    const t = parseCsv("My broker report\nAccount: 123\n\nSymbol,Type,Volume,Price\nEURUSD,buy,1,1.1\n\nSymbol,Type,Volume,Price\nGBPUSD,sell,2,1.2\nDeals,,,\nEURUSD,buy,1,1.1\n");
    expect(t.headerRow).toBe(2);
    expect(t.rows).toHaveLength(2);
    expect(t.notes.join(" ")).toMatch(/Skipped 2 lines/);
    expect(t.notes.join(" ")).toMatch(/section "Deals"/);
  });
  it("pads short rows", () => {
    const t = parseCsv("Symbol,Side,Price,SL\nEURUSD,buy,1.1\n");
    expect(t.rows[0]).toEqual(["EURUSD", "buy", "1.1", ""]);
  });
});

describe("autoMap", () => {
  it("maps a typical journal export", () => {
    const h = ["Open Time", "Close Time", "Instrument", "Side", "Qty", "Entry Price", "Exit Price", "P&L", "Fees", "Rollover", "Stop", "Target", "Trade ID"];
    expect(named(h, autoMap(h))).toEqual({
      openedAt: "Open Time",
      closedAt: "Close Time",
      symbol: "Instrument",
      direction: "Side",
      quantity: "Qty",
      entryPrice: "Entry Price",
      exitPrice: "Exit Price",
      profit: "P&L",
      commission: "Fees",
      swap: "Rollover",
      stopLoss: "Stop",
      takeProfit: "Target",
      externalId: "Trade ID",
    });
  });
  it("maps separate date and time columns", () => {
    const h = ["Date", "Time", "Ticker", "Action", "Size", "Price", "Close Date", "Close Time", "Close Price", "Net PnL"];
    const m = named(h, autoMap(h, [["2024-03-15", "09:30", "NQ", "Buy", "1", "18000", "2024-03-15", "10:00", "18010", "200"]]));
    expect(m).toMatchObject({ openedAt: "Date", openTime: "Time", closedAt: "Close Date", closeTime: "Close Time", entryPrice: "Price", exitPrice: "Close Price", profit: "Net PnL", symbol: "Ticker", direction: "Action", quantity: "Size" });
  });
  it("drops a separate-time mapping when the column holds full timestamps", () => {
    const h = ["Date", "Time", "Symbol", "Type", "Lots", "Price"];
    const m = autoMap(h, [["2024-03-15", "2024-03-15 09:30", "EURUSD", "buy", "1", "1.1"]]);
    expect(m.openTime).toBeNull();
  });
  it("maps MetaTrader 5 repeated Time/Price headers by position", () => {
    const h = ["Time", "Position", "Symbol", "Type", "Volume", "Price", "S / L", "T / P", "Time", "Price", "Commission", "Swap", "Profit"];
    expect(headerKeys(h)).toContain("time#2");
    const m = autoMap(h);
    expect(m).toMatchObject({ openedAt: 0, externalId: 1, symbol: 2, direction: 3, quantity: 4, entryPrice: 5, stopLoss: 6, takeProfit: 7, closedAt: 8, exitPrice: 9, commission: 10, swap: 11, profit: 12 });
    expect(detectFileAdapter(h).id).toBe("mt5-positions-csv");
  });
  it("uses prefix aliases for headers with units", () => {
    const h = ["Symbol", "Direction", "Opened", "Entry", "Volume (lots)", "Profit (USD)", "Commission (USD)"];
    expect(named(h, autoMap(h))).toMatchObject({ quantity: "Volume (lots)", profit: "Profit (USD)", commission: "Commission (USD)" });
    expect(detectFileAdapter(h).id).toBe("generic-csv");
  });
});

describe("validateMapping", () => {
  it("requires symbol, direction, open time, entry price and quantity", () => {
    const h = ["Symbol", "Side"];
    const { errors } = validateMapping(autoMap(h));
    expect(errors.map((e) => e.field)).toEqual(["openedAt", "entryPrice", "quantity"]);
  });
  it("warns when nothing marks trades as closed, or when profit is missing", () => {
    const open = validateMapping(autoMap(["Symbol", "Side", "Date", "Price", "Qty"]));
    expect(open.errors).toEqual([]);
    expect(open.warnings[0].message).toMatch(/open trade/);
    const noProfit = validateMapping(autoMap(["Symbol", "Side", "Open time", "Close time", "Entry", "Exit", "Qty"]));
    expect(noProfit.warnings[0].field).toBe("profit");
  });
  it("rejects a column mapped twice", () => {
    const m = autoMap(["Symbol", "Side", "Date", "Price", "Qty"]);
    m.exitPrice = m.entryPrice;
    expect(validateMapping(m).errors.some((e) => /more than one/.test(e.message))).toBe(true);
  });
});
