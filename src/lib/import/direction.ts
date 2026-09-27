/** Direction synonyms used by brokers and platforms. */

export type ParsedDirection = { kind: "trade"; direction: "LONG" | "SHORT" } | { kind: "non-trade"; label: string } | { kind: "invalid" };

const LONG = new Set(["buy", "long", "b", "bot", "bought", "l", "buy limit", "buy stop", "buy stop limit", "buy to open", "bto", "buy market", "market buy", "limit buy", "stop buy", "1", "+1"]);
const SHORT = new Set(["sell", "short", "s", "sld", "sold", "sell limit", "sell stop", "sell stop limit", "sell short", "ss", "sell to open", "sto", "sell market", "market sell", "limit sell", "stop sell", "-1"]);
/** Account operations that appear in platform histories but are not trades. */
const NON_TRADE = new Set(["balance", "deposit", "withdrawal", "withdraw", "credit", "bonus", "correction", "commission", "fee", "dividend", "interest", "transfer", "adjustment", "charge", "rebate"]);

export function parseDirection(raw: string | null | undefined): ParsedDirection {
  const t = (raw ?? "").trim().toLowerCase();
  const s = /^[-+]?\d+$/.test(t) ? t : t.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  if (!s) return { kind: "invalid" };
  if (LONG.has(s)) return { kind: "trade", direction: "LONG" };
  if (SHORT.has(s)) return { kind: "trade", direction: "SHORT" };
  if (NON_TRADE.has(s)) return { kind: "non-trade", label: s };
  // "Buy (close)", "SELL 0.10", "buy EURUSD" — take the leading word.
  const first = s.split(/[\s(/,]/)[0];
  if (first === "buy" || first === "long") return { kind: "trade", direction: "LONG" };
  if (first === "sell" || first === "short") return { kind: "trade", direction: "SHORT" };
  return { kind: "invalid" };
}
