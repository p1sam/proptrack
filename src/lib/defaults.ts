import type { CategoryKind, TagKind, AssetClass } from "@/generated/prisma/enums";

export const DEFAULT_STRATEGIES = ["Breakout", "Pullback", "Reversal", "Trend continuation", "Liquidity sweep", "Support/resistance"];

export const DEFAULT_TAGS: { name: string; kind: TagKind }[] = [
  { name: "Followed plan", kind: "POSITIVE" },
  { name: "Broke plan", kind: "MISTAKE" },
  { name: "FOMO", kind: "MISTAKE" },
  { name: "Revenge trade", kind: "MISTAKE" },
  { name: "Overtraded", kind: "MISTAKE" },
  { name: "Moved stop", kind: "MISTAKE" },
  { name: "Took profit early", kind: "MISTAKE" },
  { name: "Entered late", kind: "MISTAKE" },
  { name: "Oversized", kind: "MISTAKE" },
  { name: "Chased trade", kind: "MISTAKE" },
  { name: "News event", kind: "NEUTRAL" },
];

export const DEFAULT_CATEGORIES: Record<CategoryKind, string[]> = {
  SETUP: ["Break & retest", "Opening range breakout", "Double top/bottom", "Flag", "Range fade", "Stop hunt"],
  TIMEFRAME: ["M1", "M5", "M15", "H1", "H4", "D1"],
  TRADE_TYPE: ["Scalp", "Intraday", "Swing"],
  ENTRY_MODEL: ["Market", "Limit", "Stop", "Retest confirmation"],
  CONFLUENCE: ["HTF trend", "Key level", "Liquidity", "Fair value gap", "Volume", "Session open"],
  MARKET_CONDITION: ["Trending", "Ranging", "Volatile", "Low volatility"],
};

/** Point values assume a USD account and USD-quoted instruments; edit per broker in Settings. */
export const DEFAULT_INSTRUMENTS: { symbol: string; name: string; assetClass: AssetClass; pointValue: number; tickSize?: number }[] = [
  { symbol: "EURUSD", name: "Euro / US Dollar", assetClass: "FOREX", pointValue: 100000, tickSize: 0.00001 },
  { symbol: "GBPUSD", name: "British Pound / US Dollar", assetClass: "FOREX", pointValue: 100000, tickSize: 0.00001 },
  { symbol: "XAUUSD", name: "Gold", assetClass: "COMMODITY", pointValue: 100, tickSize: 0.01 },
  { symbol: "NAS100", name: "Nasdaq 100 CFD", assetClass: "INDEX", pointValue: 1, tickSize: 0.1 },
  { symbol: "US30", name: "Dow Jones 30 CFD", assetClass: "INDEX", pointValue: 1, tickSize: 1 },
  { symbol: "BTCUSD", name: "Bitcoin", assetClass: "CRYPTO", pointValue: 1, tickSize: 0.01 },
];

export const TAG_COLORS: Record<TagKind, string> = { POSITIVE: "#2a9d8f", MISTAKE: "#e5484d", NEUTRAL: "#8b8fa3" };
