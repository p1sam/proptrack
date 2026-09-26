import Papa from "papaparse";
import { headerScore } from "./fields";

/**
 * CSV/TSV text → table. Handles BOM, comma/semicolon/tab/pipe delimiters, quoted fields,
 * preamble lines before the header (report titles) and trailing sections.
 */

export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const ACCEPTED_EXTENSIONS = [".csv", ".txt", ".tsv"];

export interface ParsedTable {
  headers: string[];
  rows: string[][];
  delimiter: string;
  /** 0-based index (among non-empty lines) of the header row. */
  headerRow: number;
  notes: string[];
}

const DELIMITERS = [",", ";", "\t", "|"] as const;

function parseWith(text: string, delimiter: string, preview = 0): string[][] {
  const res = Papa.parse<string[]>(text, { delimiter, skipEmptyLines: "greedy", preview });
  return res.data.map((r) => r.map((c) => (c ?? "").toString()));
}

/** Pick the delimiter that yields the most consistent multi-column rows in the first lines. */
export function detectDelimiter(text: string): string {
  let best: { d: string; score: number } = { d: ",", score: -1 };
  for (const d of DELIMITERS) {
    const rows = parseWith(text, d, 30);
    if (!rows.length) continue;
    const counts = new Map<number, number>();
    for (const r of rows) counts.set(r.length, (counts.get(r.length) ?? 0) + 1);
    let modeLen = 1;
    let modeCount = 0;
    for (const [len, c] of counts) if (len > 1 && (c > modeCount || (c === modeCount && len > modeLen))) [modeLen, modeCount] = [len, c];
    if (modeLen <= 1) continue;
    // A delimiter that splits the header into recognisable column names wins outright.
    const headerHits = Math.max(...rows.map(headerScore));
    const score = headerHits * 10_000 + modeCount * 100 + modeLen;
    if (score > best.score) best = { d, score };
  }
  return best.d;
}

export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

export function parseCsv(input: string, opts: { delimiter?: string } = {}): ParsedTable {
  const text = stripBom(input);
  const notes: string[] = [];
  const delimiter = opts.delimiter ?? detectDelimiter(text);
  const all = parseWith(text, delimiter);
  if (!all.length) return { headers: [], rows: [], delimiter, headerRow: 0, notes: ["The file is empty."] };

  // Header = the row among the first 30 that looks most like column names.
  let headerRow = 0;
  let bestScore = 0;
  for (let i = 0; i < Math.min(all.length, 30); i++) {
    const s = headerScore(all[i]);
    if (s > bestScore) {
      bestScore = s;
      headerRow = i;
    }
  }
  if (bestScore < 2) headerRow = all.findIndex((r) => r.filter((c) => c.trim()).length > 1);
  if (headerRow < 0) headerRow = 0;
  if (headerRow > 0) notes.push(`Skipped ${headerRow} line${headerRow === 1 ? "" : "s"} before the header row.`);

  const headers = all[headerRow].map((h, i) => h.trim() || `Column ${i + 1}`);
  const rows: string[][] = [];
  for (let i = headerRow + 1; i < all.length; i++) {
    const r = all[i];
    const filled = r.filter((c) => c.trim() !== "");
    if (!filled.length) continue;
    // A single-cell line after data (e.g. "Orders", "Deals" in MetaTrader reports) starts a new section.
    if (filled.length === 1 && r.length < headers.length && rows.length > 0 && !/^\s*-?[\d.,]+\s*$/.test(filled[0])) {
      notes.push(`Stopped at section "${filled[0].trim().slice(0, 40)}" — only the first table is imported.`);
      break;
    }
    // A repeated header line mid-file is ignored.
    if (r.map((c) => c.trim()).join("\u0000") === headers.join("\u0000")) continue;
    rows.push(r.length >= headers.length ? r : [...r, ...Array(headers.length - r.length).fill("")]);
  }
  return { headers, rows, delimiter, headerRow, notes };
}

export function delimiterLabel(d: string): string {
  return d === "\t" ? "tab" : d === ";" ? "semicolon" : d === "|" ? "pipe" : "comma";
}
