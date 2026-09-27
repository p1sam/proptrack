import { ACCEPTED_EXTENSIONS } from "../csv";
import { autoMap, headerKeys } from "../fields";
import { normalizeRows } from "../normalize";
import type { AvailableFileAdapter } from "./types";

const SIGNATURE = ["time", "time#2", "price", "price#2", "symbol", "type", "volume"];

/**
 * MetaTrader 5 "Positions" table (History → Report, or a copy of it saved as CSV):
 *   Time, Position, Symbol, Type, Volume, Price, S / L, T / P, Time, Price, Commission, Swap, Profit
 * The first Time/Price pair is the entry, the second the exit. Profit excludes commission and
 * swap (they are separate columns), so it is gross. Timestamps are broker server time.
 */
export const mt5PositionsAdapter: AvailableFileAdapter = {
  id: "mt5-positions-csv",
  label: "MetaTrader 5 positions (CSV)",
  description: "The Positions table of an MT5 history report saved as CSV. Profit is treated as gross; commission and swap come from their own columns.",
  formats: ["CSV"],
  kind: "file",
  status: "available",
  accept: ACCEPTED_EXTENSIONS,
  detect(headers) {
    const keys = new Set(headerKeys(headers));
    if (!SIGNATURE.every((k) => keys.has(k))) return 0;
    return keys.has("position") || keys.has("ticket") ? 0.95 : 0.8;
  },
  suggestMapping: autoMap,
  defaults: { dateFormat: "ymd", profitIsNet: false },
  parse: ({ table, mapping, options }) => normalizeRows(table.rows, mapping, options),
};
