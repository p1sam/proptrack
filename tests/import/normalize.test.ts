import { describe, expect, it } from "vitest";
import { computeTrade } from "@/lib/calc/trade";
import { parseDirection } from "@/lib/import/direction";
import { autoMap } from "@/lib/import/fields";
import { grossFromReported, normalizeRow, normalizeRows, summarize, type NormalizeOptions } from "@/lib/import/normalize";

const opts: NormalizeOptions = { timeZone: "UTC", dateFormat: "auto", decimal: ".", profitIsNet: false };
const H = ["Open time", "Close time", "Symbol", "Side", "Qty", "Entry", "Exit", "Profit", "Commission", "Swap", "SL", "TP", "Ticket"];
const map = autoMap(H);
const row = (over: Partial<Record<(typeof H)[number], string>> = {}) => {
  const base: Record<string, string> = {
    "Open time": "2024-03-15 09:30:00",
    "Close time": "2024-03-15 10:15:00",
    Symbol: "eurusd",
    Side: "Buy",
    Qty: "1",
    Entry: "1.0850",
    Exit: "1.0875",
    Profit: "250",
    Commission: "-7",
    Swap: "-1.5",
    SL: "1.0830",
    TP: "0",
    Ticket: "123456",
  };
  return H.map((h) => over[h] ?? base[h]);
};

describe("parseDirection", () => {
  it.each([
    ["Buy", "LONG"], ["LONG", "LONG"], ["b", "LONG"], ["BOT", "LONG"], ["buy limit", "LONG"], ["Buy_Stop", "LONG"], ["buy (close)", "LONG"],
    ["Sell", "SHORT"], ["short", "SHORT"], ["S", "SHORT"], ["SLD", "SHORT"], ["sell stop", "SHORT"], ["Sell Short", "SHORT"], ["-1", "SHORT"],
  ])("%s → %s", (raw, dir) => {
    expect(parseDirection(raw)).toEqual({ kind: "trade", direction: dir });
  });
  it("recognises account operations and garbage", () => {
    expect(parseDirection("balance").kind).toBe("non-trade");
    expect(parseDirection("Deposit").kind).toBe("non-trade");
    expect(parseDirection("hold").kind).toBe("invalid");
    expect(parseDirection("").kind).toBe("invalid");
  });
});

describe("normalizeRow", () => {
  it("normalizes a complete closed trade", () => {
    const r = normalizeRow(row(), 0, map, opts);
    expect(r.status).toBe("ok");
    expect(r.trade).toMatchObject({
      symbol: "EURUSD",
      direction: "LONG",
      entryPrice: 1.085,
      exitPrice: 1.0875,
      exitPriceKnown: true,
      quantity: 1,
      commission: 7,
      swap: -1.5,
      reportedProfit: 250,
      grossPnl: 250,
      stopLoss: 1.083,
      takeProfit: null, // 0 = none
      externalId: "123456",
    });
    expect(r.trade!.openedAt.toISOString()).toBe("2024-03-15T09:30:00.000Z");
    expect(r.trade!.closedAt!.toISOString()).toBe("2024-03-15T10:15:00.000Z");
  });

  it("gross profit: net = profit − commission + swap", () => {
    const t = normalizeRow(row(), 0, map, { ...opts, profitIsNet: false }).trade!;
    const c = computeTrade({ direction: t.direction, entryPrice: t.entryPrice, quantity: t.quantity, pointValue: 1, exits: [{ price: t.exitPrice!, quantity: t.quantity }], commission: t.commission, swap: t.swap, reportedGrossPnl: t.grossPnl });
    expect(c.grossPnl).toBe(250);
    expect(c.netPnl).toBe(241.5);
  });

  it("net profit: stored gross is adjusted so the journal's net equals the file's profit", () => {
    const t = normalizeRow(row(), 0, map, { ...opts, profitIsNet: true }).trade!;
    expect(t.grossPnl).toBe(258.5); // 250 + 7 − (−1.5)
    const c = computeTrade({ direction: t.direction, entryPrice: t.entryPrice, quantity: t.quantity, pointValue: 1, exits: [{ price: t.exitPrice!, quantity: t.quantity }], commission: t.commission, swap: t.swap, reportedGrossPnl: t.grossPnl });
    expect(c.netPnl).toBe(250);
  });

  it("grossFromReported handles positive swap and commission signs", () => {
    expect(grossFromReported(-100, 5, 2.25, true)).toBe(-97.25);
    expect(grossFromReported(-100, -5, 2.25, true)).toBe(-97.25);
    expect(grossFromReported(-100, 5, 2.25, false)).toBe(-100);
    expect(grossFromReported(0.1 + 0.2, 0, 0, false)).toBe(0.3);
  });

  it("uses the entry price as a stand-in exit when only profit is given", () => {
    const r = normalizeRow(row({ Exit: "" }), 0, map, opts);
    expect(r.status).toBe("warning");
    expect(r.trade).toMatchObject({ exitPrice: 1.085, exitPriceKnown: false, grossPnl: 250 });
    expect(r.warnings.join()).toMatch(/profit column/);
  });

  it("falls back to the open time when there is no close time", () => {
    const r = normalizeRow(row({ "Close time": "" }), 0, map, opts);
    expect(r.trade!.closedAt!.toISOString()).toBe("2024-03-15T09:30:00.000Z");
    expect(r.warnings.join()).toMatch(/open time is used/);
  });

  it("imports rows without any exit as open trades", () => {
    const r = normalizeRow(row({ "Close time": "", Exit: "", Profit: "" }), 0, map, opts);
    expect(r.trade).toMatchObject({ closedAt: null, exitPrice: null, grossPnl: null });
    expect(r.warnings.join()).toMatch(/open trade/);
  });

  it("reports errors per field", () => {
    const r = normalizeRow(row({ Side: "hold", Entry: "abc", Qty: "0", "Open time": "31/31/2024" }), 4, map, opts);
    expect(r.status).toBe("error");
    expect(r.trade).toBeNull();
    expect(r.errors).toEqual(expect.arrayContaining([expect.stringMatching(/Unknown direction/), expect.stringMatching(/Entry price/), expect.stringMatching(/Quantity/), expect.stringMatching(/Open/)]));
  });

  it("rejects a close before the open", () => {
    const r = normalizeRow(row({ "Close time": "2024-03-15 09:00:00" }), 0, map, opts);
    expect(r.errors).toContain("Close is before open");
  });

  it("warns when the profit sign disagrees with the price move", () => {
    const r = normalizeRow(row({ Side: "Sell" }), 0, map, opts);
    expect(r.warnings.join()).toMatch(/sign disagrees/);
  });

  it("takes |quantity| (brokers that sign quantities by side)", () => {
    expect(normalizeRow(row({ Qty: "-2" }), 0, map, opts).trade!.quantity).toBe(2);
  });

  it("skips empty rows, totals lines and balance operations", () => {
    const rows = [row(), H.map(() => ""), row({ Symbol: "", Side: "", Profit: "1234" }), row({ Side: "balance", Symbol: "" }), row({ Side: "Deposit" })];
    const out = normalizeRows(rows, map, opts);
    expect(out.map((r) => r.status)).toEqual(["ok", "skipped", "skipped", "skipped", "skipped"]);
    expect(summarize(out)).toEqual({ total: 5, ok: 1, warning: 0, error: 0, skipped: 4 });
  });

  it("converts timestamps from the file timezone", () => {
    const t = normalizeRow(row(), 0, map, { ...opts, timeZone: "America/New_York" }).trade!;
    expect(t.openedAt.toISOString()).toBe("2024-03-15T13:30:00.000Z"); // EDT
  });

  it("parses comma-decimal files with the comma choice", () => {
    const r = normalizeRow(row({ Entry: "1,0850", Exit: "1,0875", Profit: "1.250,00", Commission: "-7,00", Swap: "0", SL: "", Qty: "1,5" }), 0, map, { ...opts, decimal: "," });
    expect(r.trade).toMatchObject({ entryPrice: 1.085, exitPrice: 1.0875, grossPnl: 1250, commission: 7, quantity: 1.5 });
  });

  it("combines separate date and time columns", () => {
    const h = ["Date", "Time", "Symbol", "Side", "Qty", "Price", "Exit", "PnL"];
    const m = autoMap(h, [["2024-03-15", "09:30:00", "NQ", "Long", "2", "18000", "18010", "400"]]);
    const t = normalizeRow(["15/03/2024", "09:30:00", "NQ", "Long", "2", "18000", "18010", "400"], 0, m, { ...opts, dateFormat: "dmy" }).trade!;
    expect(t.openedAt.toISOString()).toBe("2024-03-15T09:30:00.000Z");
  });
});
