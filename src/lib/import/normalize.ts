import { addMoney, D, roundMoney, subMoney } from "@/lib/calc/money";
import { parseDateTime, type DateFormat } from "./dates";
import { parseDirection } from "./direction";
import { parseNumber, type DecimalSeparator } from "./numbers";
import type { ColumnMapping, ImportField } from "./fields";

/**
 * Turn raw CSV rows into normalized trades using a column mapping. Pure; used by the
 * browser wizard (preview) and unit tests. The server re-validates with zod.
 */

export interface NormalizedTrade {
  /** 0-based index of the data row in the file (after the header). */
  rowIndex: number;
  symbol: string;
  direction: "LONG" | "SHORT";
  openedAt: Date;
  /** Null for open trades. */
  closedAt: Date | null;
  entryPrice: number;
  /** Null for open trades. */
  exitPrice: number | null;
  /** False when the file had no exit price and the entry price stands in (P&L comes from the profit column). */
  exitPriceKnown: boolean;
  quantity: number;
  /** Positive cost. */
  commission: number;
  /** Signed (negative = cost). */
  swap: number;
  /** Profit exactly as reported in the file (null when absent). */
  reportedProfit: number | null;
  /**
   * Gross P&L to store as the platform-reported gross (null → calculated from prices). When the
   * file's profit is net, gross = profit + commission − swap so that net comes out equal to it.
   */
  grossPnl: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  externalId: string | null;
}

export interface NormalizeOptions {
  timeZone: string;
  dateFormat: DateFormat;
  decimal: DecimalSeparator;
  /** True when the profit column already includes commission and swap. */
  profitIsNet: boolean;
}

export type RowStatus = "ok" | "warning" | "error" | "skipped";

export interface NormalizedRow {
  rowIndex: number;
  status: RowStatus;
  trade: NormalizedTrade | null;
  errors: string[];
  warnings: string[];
  /** Why a non-trade row (balance operation, totals line) was left out. */
  skipReason?: string;
}

/** Gross P&L to store for a reported profit, honouring the net/gross choice. */
export function grossFromReported(profit: number, commission: number, swap: number, profitIsNet: boolean): number {
  if (!profitIsNet) return roundMoney(profit);
  // net = gross − |commission| + swap  ⇒  gross = net + |commission| − swap
  return subMoney(addMoney(profit, D(commission).abs().toNumber()), swap);
}

const MAX_SYMBOL = 32;

export function normalizeRow(cells: string[], rowIndex: number, mapping: ColumnMapping, opts: NormalizeOptions): NormalizedRow {
  const cell = (f: ImportField) => {
    const idx = mapping[f];
    return idx === null ? "" : (cells[idx] ?? "").trim();
  };
  const errors: string[] = [];
  const warnings: string[] = [];
  const skip = (reason: string): NormalizedRow => ({ rowIndex, status: "skipped", trade: null, errors: [], warnings: [], skipReason: reason });

  if (cells.every((c) => !c || !c.trim())) return skip("Empty row");
  const symbolRaw = cell("symbol");
  const dirRaw = cell("direction");
  if (!symbolRaw && !dirRaw) return skip("No symbol or direction (summary or balance line)");

  const dir = parseDirection(dirRaw);
  if (dir.kind === "non-trade") return skip(`Account operation "${dirRaw}"`);
  if (dir.kind === "invalid") errors.push(dirRaw ? `Unknown direction "${dirRaw}"` : "Missing direction");

  const symbol = symbolRaw.toUpperCase().replace(/\s+/g, "");
  if (!symbol) errors.push("Missing symbol");
  else if (symbol.length > MAX_SYMBOL) errors.push(`Symbol longer than ${MAX_SYMBOL} characters`);

  const num = (f: ImportField, label: string, { positive = false, zeroIsNull = false } = {}): number | null => {
    const raw = cell(f);
    const n = parseNumber(raw, opts.decimal);
    if (n === null) return null;
    if (Number.isNaN(n)) {
      errors.push(`${label}: "${raw}" is not a number`);
      return null;
    }
    if (zeroIsNull && n === 0) return null;
    if (positive && n <= 0) {
      errors.push(`${label} must be greater than 0`);
      return null;
    }
    return n;
  };

  const entryPrice = num("entryPrice", "Entry price", { positive: true });
  if (entryPrice === null && mapping.entryPrice !== null && !errors.some((e) => e.startsWith("Entry price"))) errors.push("Missing entry price");
  let exitPrice = num("exitPrice", "Exit price", { positive: true, zeroIsNull: true });
  let quantity = num("quantity", "Quantity");
  if (quantity !== null) {
    quantity = Math.abs(quantity);
    if (quantity === 0) {
      errors.push("Quantity must be greater than 0");
      quantity = null;
    }
  } else if (!errors.some((e) => e.startsWith("Quantity"))) errors.push("Missing quantity");
  const profit = num("profit", "Profit");
  const commissionRaw = num("commission", "Commission");
  const commission = commissionRaw === null ? 0 : Math.abs(commissionRaw);
  const swap = num("swap", "Swap") ?? 0;
  const stopLoss = num("stopLoss", "Stop loss", { zeroIsNull: true });
  const takeProfit = num("takeProfit", "Take profit", { zeroIsNull: true });
  if (stopLoss !== null && stopLoss < 0) errors.push("Stop loss cannot be negative");
  if (takeProfit !== null && takeProfit < 0) errors.push("Take profit cannot be negative");

  let openedAt: Date | null = null;
  const openRaw = cell("openedAt");
  if (!openRaw) errors.push("Missing open date");
  else {
    const r = parseDateTime(openRaw, { format: opts.dateFormat, timeZone: opts.timeZone, timeRaw: mapping.openTime !== null ? cell("openTime") : null });
    if (r.ok) {
      openedAt = r.value.date;
      if (r.value.dateOnly) warnings.push("Open has no time of day — midnight is used");
    } else errors.push(`Open: ${r.error}`);
  }
  let closedAt: Date | null = null;
  const closeRaw = cell("closedAt");
  if (closeRaw) {
    const r = parseDateTime(closeRaw, { format: opts.dateFormat, timeZone: opts.timeZone, timeRaw: mapping.closeTime !== null ? cell("closeTime") : null });
    if (r.ok) {
      closedAt = r.value.date;
      if (r.value.dateOnly) warnings.push("Close has no time of day — midnight is used");
    } else errors.push(`Close: ${r.error}`);
  }

  const closed = closedAt !== null || exitPrice !== null || profit !== null;
  let exitPriceKnown = exitPrice !== null;
  if (closed && openedAt) {
    if (!closedAt) {
      closedAt = openedAt;
      warnings.push("No close time — the open time is used");
    } else if (closedAt.getTime() < openedAt.getTime()) {
      errors.push("Close is before open");
    }
    if (exitPrice === null) {
      if (profit !== null && entryPrice !== null) {
        exitPrice = entryPrice;
        exitPriceKnown = false;
        warnings.push("No exit price — P&L is taken from the profit column");
      } else if (profit === null) {
        errors.push("Closed trade needs an exit price or a profit");
      }
    }
  }
  if (!closed && openedAt) warnings.push("No exit — imported as an open trade");

  const grossPnl = profit === null ? null : grossFromReported(profit, commission, swap, opts.profitIsNet);

  // Sanity check: the reported profit should agree in sign with the price move.
  if (grossPnl !== null && exitPriceKnown && exitPrice !== null && entryPrice !== null && dir.kind === "trade") {
    const move = (exitPrice - entryPrice) * (dir.direction === "LONG" ? 1 : -1);
    if (move !== 0 && Math.abs(grossPnl) > 0.01 && Math.sign(move) !== Math.sign(grossPnl))
      warnings.push("Profit sign disagrees with the price move — check the direction column");
  }

  const externalId = cell("externalId").slice(0, 64) || null;

  if (errors.length || dir.kind !== "trade" || !openedAt || entryPrice === null || quantity === null) {
    return { rowIndex, status: "error", trade: null, errors: errors.length ? errors : ["Invalid row"], warnings };
  }
  return {
    rowIndex,
    status: warnings.length ? "warning" : "ok",
    errors,
    warnings,
    trade: {
      rowIndex,
      symbol,
      direction: dir.direction,
      openedAt,
      closedAt: closed ? closedAt : null,
      entryPrice,
      exitPrice: closed ? exitPrice : null,
      exitPriceKnown: closed ? exitPriceKnown : false,
      quantity,
      commission,
      swap,
      reportedProfit: profit,
      grossPnl,
      stopLoss,
      takeProfit,
      externalId,
    },
  };
}

export function normalizeRows(rows: string[][], mapping: ColumnMapping, opts: NormalizeOptions): NormalizedRow[] {
  return rows.map((cells, i) => normalizeRow(cells, i, mapping, opts));
}

export interface NormalizeSummary {
  total: number;
  ok: number;
  warning: number;
  error: number;
  skipped: number;
}

export function summarize(rows: NormalizedRow[]): NormalizeSummary {
  const s: NormalizeSummary = { total: rows.length, ok: 0, warning: 0, error: 0, skipped: 0 };
  for (const r of rows) s[r.status]++;
  return s;
}
