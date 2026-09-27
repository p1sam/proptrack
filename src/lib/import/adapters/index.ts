import { genericCsvAdapter } from "./generic-csv";
import { mt5PositionsAdapter } from "./mt5-positions";
import type { AvailableFileAdapter, TradeSourceAdapter } from "./types";

export type * from "./types";

/** Every trade source PropTrack knows about. Only "available" ones can be used. */
export const ADAPTERS: TradeSourceAdapter[] = [
  genericCsvAdapter,
  mt5PositionsAdapter,
  {
    id: "metatrader-statement",
    label: "MetaTrader 4/5 statement",
    description: "Detailed HTML/XLSX account statements from MT4 and MT5, including deals and balance operations.",
    formats: ["HTML", "XLSX"],
    kind: "file",
    status: "coming_later",
    accept: [".htm", ".html", ".xlsx"],
  },
  {
    id: "ctrader",
    label: "cTrader",
    description: "Sync closed positions from cTrader accounts via the Open API.",
    kind: "api",
    status: "coming_later",
    credentials: [
      { key: "accountId", label: "cTrader account ID", type: "text" },
      { key: "accessToken", label: "Access token", type: "password", secret: true },
    ],
  },
  {
    id: "tradingview",
    label: "TradingView",
    description: "Import the List of Trades exported from TradingView paper or broker trading.",
    formats: ["CSV"],
    kind: "file",
    status: "coming_later",
    accept: [".csv"],
  },
  {
    id: "interactive-brokers",
    label: "Interactive Brokers",
    description: "Flex Query trade confirmations, matched into round-trip trades.",
    kind: "api",
    status: "coming_later",
    credentials: [
      { key: "flexToken", label: "Flex Web Service token", type: "password", secret: true },
      { key: "queryId", label: "Flex query ID", type: "text" },
    ],
  },
  {
    id: "dxtrade",
    label: "DXtrade",
    description: "Sync prop-firm accounts that run on DXtrade.",
    kind: "api",
    status: "coming_later",
    credentials: [
      { key: "server", label: "Server URL", type: "text" },
      { key: "username", label: "Username", type: "text" },
      { key: "password", label: "Password", type: "password", secret: true },
    ],
  },
  {
    id: "match-trader",
    label: "Match-Trader",
    description: "Sync prop-firm accounts that run on Match-Trader.",
    kind: "api",
    status: "coming_later",
    credentials: [
      { key: "server", label: "Broker server", type: "text" },
      { key: "email", label: "Login email", type: "text" },
      { key: "password", label: "Password", type: "password", secret: true },
    ],
  },
];

export const FILE_ADAPTERS: AvailableFileAdapter[] = ADAPTERS.filter((a): a is AvailableFileAdapter => a.kind === "file" && a.status === "available");

export function getFileAdapter(id: string): AvailableFileAdapter {
  return FILE_ADAPTERS.find((a) => a.id === id) ?? genericCsvAdapter;
}

/** The best matching file adapter for a header row (generic CSV when nothing specific fits). */
export function detectFileAdapter(headers: string[]): AvailableFileAdapter {
  let best: { a: AvailableFileAdapter; score: number } = { a: genericCsvAdapter, score: 0 };
  for (const a of FILE_ADAPTERS) {
    const score = a.detect(headers);
    if (score > best.score) best = { a, score };
  }
  return best.score >= 0.75 ? best.a : genericCsvAdapter;
}

/** Serializable summary for client lists (no functions). */
export function adapterSummaries() {
  return ADAPTERS.map((a) => ({ id: a.id, label: a.label, description: a.description, kind: a.kind, status: a.status, formats: a.formats ?? [] }));
}
export type AdapterSummary = ReturnType<typeof adapterSummaries>[number];

export const IMPORT_SOURCE_IDS = FILE_ADAPTERS.map((a) => a.id);
