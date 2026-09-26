/**
 * Import target fields and the header alias table used to auto-map CSV columns.
 * Mapping is by column index, so files with repeated header names (MetaTrader 5's
 * "Time … Price … Time … Price") map correctly: the n-th occurrence of a header is
 * addressed as "name#n" in the alias lists.
 */

export const IMPORT_FIELDS = [
  "symbol",
  "direction",
  "openedAt",
  "openTime",
  "closedAt",
  "closeTime",
  "entryPrice",
  "exitPrice",
  "quantity",
  "profit",
  "commission",
  "swap",
  "stopLoss",
  "takeProfit",
  "externalId",
] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];

export type ColumnMapping = Record<ImportField, number | null>;

export const FIELD_META: Record<ImportField, { label: string; description: string; required?: boolean }> = {
  symbol: { label: "Symbol", description: "Instrument / ticker, e.g. EURUSD, NQ, AAPL", required: true },
  direction: { label: "Direction", description: "Buy/sell, long/short", required: true },
  openedAt: { label: "Open date / time", description: "Entry date, or date and time in one column", required: true },
  openTime: { label: "Open time (separate)", description: "Only when the entry time is in its own column" },
  closedAt: { label: "Close date / time", description: "Exit date, or date and time in one column" },
  closeTime: { label: "Close time (separate)", description: "Only when the exit time is in its own column" },
  entryPrice: { label: "Entry price", description: "Open / fill price", required: true },
  exitPrice: { label: "Exit price", description: "Close price" },
  quantity: { label: "Quantity", description: "Lots, contracts, shares or units", required: true },
  profit: { label: "Profit", description: "Reported P&L in account currency" },
  commission: { label: "Commission", description: "Commission / fees (sign is ignored — always a cost)" },
  swap: { label: "Swap", description: "Swap / rollover / financing (negative = cost)" },
  stopLoss: { label: "Stop loss", description: "Initial stop price" },
  takeProfit: { label: "Take profit", description: "Target price" },
  externalId: { label: "Ticket / ID", description: "Platform ticket, order or position id" },
};

/** Normalise a header for alias matching: lowercase, letters and digits only. */
export function normalizeHeader(h: string): string {
  return h
    .replace(/^﻿/, "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

/** Exact aliases, in priority order. "x#2" = the second column whose header normalises to "x". */
const ALIASES: Record<ImportField, string[]> = {
  openedAt: [
    "opendatetime", "entrydatetime", "datetimeopen", "openedat", "opendate", "entrydate", "dateopen", "opentime", "entrytime", "timeopen",
    "opened", "opening", "openingtime", "datetime", "tradedate", "date", "time", "executiontime", "timestamp",
  ],
  openTime: ["opentime", "entrytime", "timeopen", "time"],
  closedAt: [
    "closedatetime", "exitdatetime", "datetimeclose", "closedat", "closedate", "exitdate", "dateclose", "closetime", "exittime", "timeclose",
    "closed", "closing", "closingtime", "time#2", "date#2",
  ],
  closeTime: ["closetime", "exittime", "timeclose", "time#2"],
  symbol: ["symbol", "instrument", "ticker", "market", "pair", "asset", "contract", "security", "item", "underlying", "product", "symbolname", "instrumentname"],
  direction: ["side", "direction", "type", "action", "buysell", "bs", "longshort", "positiontype", "tradetype", "dealtype", "ordertype"],
  entryPrice: ["entryprice", "openprice", "priceopen", "openingprice", "avgentryprice", "averageentryprice", "entry", "avgprice", "averageprice", "fillprice", "price"],
  exitPrice: ["exitprice", "closeprice", "priceclose", "closingprice", "avgexitprice", "averageexitprice", "exit", "price#2"],
  quantity: ["quantity", "qty", "volume", "lots", "lot", "size", "lotsize", "contracts", "units", "shares", "positionsize", "filledqty", "filledquantity"],
  profit: ["profit", "pnl", "pl", "netpnl", "netpl", "netprofit", "realizedpnl", "realizedpl", "profitloss", "profitandloss", "grosspnl", "grossprofit", "result", "net", "realized", "gain"],
  commission: ["commission", "commissions", "comm", "fee", "fees", "totalfees", "brokerage", "commissionfee", "commissionandfees"],
  swap: ["swap", "swaps", "rollover", "financing", "overnight", "overnightfee", "storage"],
  stopLoss: ["sl", "stoploss", "stop", "initialstop", "stoplossprice"],
  takeProfit: ["tp", "takeprofit", "target", "profittarget", "takeprofitprice"],
  externalId: ["ticket", "position", "positionid", "order", "orderid", "deal", "dealid", "tradeid", "id", "ticketnumber", "ordernumber", "tradenumber", "trade", "ref", "reference"],
};

/** Prefix aliases (second pass) for headers with units, e.g. "Profit (USD)", "Volume (lots)". */
const PREFIX_ALIASES: Partial<Record<ImportField, string[]>> = {
  profit: ["profit", "netpnl", "pnl", "realizedpnl", "netprofit"],
  commission: ["commission", "fees"],
  swap: ["swap", "rollover"],
  quantity: ["volume", "quantity", "lots", "size"],
  symbol: ["symbol", "instrument"],
};

/** Header keys with occurrence suffixes: ["time", "price", "time#2", "price#2"]. */
export function headerKeys(headers: string[]): string[] {
  const seen = new Map<string, number>();
  return headers.map((h) => {
    const k = normalizeHeader(h);
    const n = (seen.get(k) ?? 0) + 1;
    seen.set(k, n);
    return n === 1 ? k : `${k}#${n}`;
  });
}

export function emptyMapping(): ColumnMapping {
  return Object.fromEntries(IMPORT_FIELDS.map((f) => [f, null])) as ColumnMapping;
}

/** Order in which fields claim columns (specific before generic). */
const CLAIM_ORDER: ImportField[] = ["symbol", "direction", "openedAt", "closedAt", "openTime", "closeTime", "entryPrice", "exitPrice", "quantity", "profit", "commission", "swap", "stopLoss", "takeProfit", "externalId"];

/**
 * Map headers to fields. Each column is used at most once. When sample rows are given, a
 * separate-time field is only kept if its column really holds times of day.
 */
export function autoMap(headers: string[], samples: string[][] = []): ColumnMapping {
  const keys = headerKeys(headers);
  const mapping = emptyMapping();
  const used = new Set<number>();
  const claim = (field: ImportField, idx: number) => {
    mapping[field] = idx;
    used.add(idx);
  };
  for (const field of CLAIM_ORDER) {
    for (const alias of ALIASES[field]) {
      const idx = keys.findIndex((k, i) => k === alias && !used.has(i));
      if (idx >= 0) {
        claim(field, idx);
        break;
      }
    }
  }
  for (const field of CLAIM_ORDER) {
    if (mapping[field] !== null) continue;
    const prefixes = PREFIX_ALIASES[field];
    if (!prefixes) continue;
    const idx = keys.findIndex((k, i) => !used.has(i) && prefixes.some((p) => k.startsWith(p)));
    if (idx >= 0) claim(field, idx);
  }

  if (samples.length) {
    const timeOnly = (idx: number) => {
      const vals = samples.map((r) => (r[idx] ?? "").trim()).filter(Boolean);
      return vals.length > 0 && vals.every((v) => /^\d{1,2}[:.]\d{2}([:.]\d{2}([.,]\d+)?)?\s*([ap]\.?m\.?)?$/i.test(v));
    };
    for (const [dt, t] of [["openedAt", "openTime"], ["closedAt", "closeTime"]] as const) {
      const ti = mapping[t];
      if (ti !== null && !timeOnly(ti)) mapping[t] = null;
      // A lone "Time" mapped as the date column but holding only times is not usable.
      const di = mapping[dt];
      if (di !== null && timeOnly(di) && mapping[t] === null) {
        mapping[dt] = null;
      }
    }
  }
  return mapping;
}

export interface MappingProblem {
  field: ImportField | null;
  message: string;
}

/** Required-field validation for a mapping (errors block the import; warnings don't). */
export function validateMapping(m: ColumnMapping): { errors: MappingProblem[]; warnings: MappingProblem[] } {
  const errors: MappingProblem[] = [];
  const warnings: MappingProblem[] = [];
  for (const f of IMPORT_FIELDS) if (FIELD_META[f].required && m[f] === null) errors.push({ field: f, message: `${FIELD_META[f].label} is required` });
  const cols = IMPORT_FIELDS.map((f) => m[f]).filter((v): v is number => v !== null);
  if (new Set(cols).size !== cols.length) errors.push({ field: null, message: "The same column is mapped to more than one field" });
  if (m.closedAt === null && m.exitPrice === null && m.profit === null)
    warnings.push({ field: "closedAt", message: "No close time, exit price or profit column — every row will be imported as an open trade." });
  else if (m.profit === null) warnings.push({ field: "profit", message: "No profit column — P&L will be calculated from prices × the instrument's point value (1 for new instruments)." });
  if (m.closeTime !== null && m.closedAt === null) errors.push({ field: "closedAt", message: "A separate close time needs a close date column" });
  return { errors, warnings };
}

const KNOWN_KEYS = new Set(Object.values(ALIASES).flatMap((list) => list.filter((a) => !a.includes("#"))));

/** How many cells of a row look like known column headers (used to find the header row). */
export function headerScore(cells: string[]): number {
  const keys = cells.map(normalizeHeader).filter(Boolean);
  const hits = keys.filter((k) => KNOWN_KEYS.has(k)).length;
  // Rows made of numbers/dates are data, not headers.
  return cells.some((c) => /^\s*-?\d+([.,]\d+)?\s*$/.test(c)) ? Math.min(hits, 1) : hits;
}
