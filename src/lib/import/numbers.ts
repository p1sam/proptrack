/**
 * Locale-tolerant number parsing for imported files.
 *
 * Handles thousands separators ("1,234.56" / "1.234,56" / "1 234,56" / "1'234.56"), currency
 * symbols and codes ("$1,200", "1200 USD", "€ -5"), parentheses negatives ("(12.50)"), leading
 * plus and trailing minus ("12.50-").
 */

export type DecimalSeparator = "." | ",";

const CURRENCY_CHARS = /[$€£¥₹₩₽₺₪฿₫₴₦₱₲₵₡₭₮₸₼₾]/g;
// Unicode spaces: regular, no-break, narrow no-break, thin, figure.
const SPACES = /[\s    ]/g;

/**
 * Parse a number from a cell. Returns null for blank / dash-only cells and NaN for text that
 * is not a number, so callers can tell "missing" from "invalid".
 */
export function parseNumber(raw: string | number | null | undefined, decimal: DecimalSeparator = "."): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : Number.NaN;
  let s = raw.trim();
  if (s === "" || /^[-–—]+$/.test(s) || /^n\/?a$/i.test(s)) return null;

  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  s = s.replace(CURRENCY_CHARS, "").replace(/\b[A-Z]{3}\b/g, "").replace(SPACES, "").replace(/['’]/g, "");
  if (s.endsWith("-") && !s.startsWith("-")) {
    negative = !negative;
    s = s.slice(0, -1);
  }
  if (s.startsWith("+")) s = s.slice(1);
  if (s.startsWith("-")) {
    negative = !negative;
    s = s.slice(1);
  }
  // Currency symbol between sign and digits, e.g. "-$5" → already stripped above.
  if (s === "") return Number.NaN;

  const thousands = decimal === "." ? "," : ".";
  // Thousands separators must group digits in threes; otherwise the value is ambiguous/invalid.
  if (s.includes(thousands)) {
    const [intPart] = s.split(decimal);
    if (!/^\d{1,3}([.,]\d{3})+$/.test(intPart) || s.split(decimal).length > 2) return Number.NaN;
    s = s.split(thousands).join("");
  }
  if (decimal === ",") s = s.replace(",", ".");
  if (!/^(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s)) return Number.NaN;
  const n = Number(s);
  if (!Number.isFinite(n)) return Number.NaN;
  return negative ? -n : n === 0 ? 0 : n;
}

/**
 * Guess the decimal separator from sample cells. Returns "ambiguous" when the samples fit
 * both conventions (e.g. only values like "1,234" appear).
 */
export function detectDecimalSeparator(samples: string[]): DecimalSeparator | "ambiguous" {
  let dotVotes = 0;
  let commaVotes = 0;
  let ambiguous = 0;
  for (const raw of samples) {
    const s = raw.replace(SPACES, "").replace(CURRENCY_CHARS, "").replace(/[()+\-'’]/g, "");
    if (!/\d/.test(s)) continue;
    const lastDot = s.lastIndexOf(".");
    const lastComma = s.lastIndexOf(",");
    if (lastDot >= 0 && lastComma >= 0) {
      if (lastDot > lastComma) dotVotes++;
      else commaVotes++;
      continue;
    }
    const sep = lastDot >= 0 ? "." : lastComma >= 0 ? "," : null;
    if (!sep) continue;
    const parts = s.split(sep);
    const decimals = parts[parts.length - 1];
    if (parts.length > 2) {
      // "1.234.567" → that char is a thousands separator.
      if (sep === ".") commaVotes++;
      else dotVotes++;
    } else if (decimals.length === 3) {
      ambiguous++;
    } else if (sep === ".") dotVotes++;
    else commaVotes++;
  }
  if (dotVotes && !commaVotes) return ".";
  if (commaVotes && !dotVotes) return ",";
  if (!dotVotes && !commaVotes) return ambiguous ? "ambiguous" : ".";
  return dotVotes >= commaVotes ? "." : ",";
}
