import { isPossibleDuplicate, tradeFingerprint, type FingerprintInput } from "./fingerprint";

/**
 * Duplicate detection for imports, both against the account's existing trades and within
 * the file itself. Exact = same fingerprint (minute + prices + size); possible = loose match
 * with entry within `toleranceSec` (see isPossibleDuplicate).
 */

export interface DuplicateCandidate {
  /** Row index in the file. */
  row: number;
  symbol: string;
  direction: "LONG" | "SHORT";
  openedAt: Date;
  closedAt: Date | null;
  entryPrice: number;
  /** Exit price as it will be stored. */
  exitPrice: number | null;
  /** False when the exit price is a stand-in; the loose match then ignores it. */
  exitPriceKnown?: boolean;
  quantity: number;
}

export interface ExistingTradeLite {
  id: string;
  symbol: string;
  direction: "LONG" | "SHORT";
  openedAt: Date;
  closedAt: Date | null;
  entryPrice: number;
  exitPrice: number | null;
  quantity: number;
  /** Stored fingerprint, if any (compared in addition to the recomputed one). */
  fingerprint?: string | null;
}

export type DuplicateKind = "exact" | "possible";

export interface ExistingDuplicate {
  row: number;
  kind: DuplicateKind;
  tradeId: string;
}

export interface FileDuplicate {
  row: number;
  kind: DuplicateKind;
  /** The earlier row in the file this one repeats. */
  ofRow: number;
}

/** Result of the server duplicate check shown in the wizard. */
export interface DuplicateReport {
  existing: { row: number; kind: "exact" | "possible"; trade: { id: string; symbol: string; direction: "LONG" | "SHORT"; openedAt: string; entryPrice: number; quantity: number; netPnl: number | null; source: string } }[];
  file: { row: number; kind: "exact" | "possible"; ofRow: number }[];
}

export const DUPLICATE_TOLERANCE_SEC = 60;

function fpInput(accountId: string, t: Omit<DuplicateCandidate, "row">, forLoose = false): FingerprintInput {
  return {
    accountId,
    symbol: t.symbol,
    direction: t.direction,
    openedAt: t.openedAt,
    closedAt: t.closedAt,
    entryPrice: t.entryPrice,
    exitPrice: forLoose && t.exitPriceKnown === false ? null : t.exitPrice,
    quantity: t.quantity,
  };
}

export function candidateFingerprint(accountId: string, c: Omit<DuplicateCandidate, "row">): string {
  return tradeFingerprint(fpInput(accountId, c));
}

/** Groups items by symbol+direction, sorted by open time, for windowed lookups. */
class OpenTimeIndex<T extends { symbol: string; direction: string; openedAt: Date }> {
  private groups = new Map<string, { t: number; item: T }[]>();
  constructor(items: T[]) {
    for (const item of items) {
      const key = `${item.symbol.toUpperCase()}|${item.direction}`;
      let g = this.groups.get(key);
      if (!g) this.groups.set(key, (g = []));
      g.push({ t: item.openedAt.getTime(), item });
    }
    for (const g of this.groups.values()) g.sort((a, b) => a.t - b.t);
  }
  /** Items of the same symbol/direction opened within ±toleranceMs of `at`. */
  near(symbol: string, direction: string, at: Date, toleranceMs: number): T[] {
    const g = this.groups.get(`${symbol.toUpperCase()}|${direction}`);
    if (!g) return [];
    const lo = at.getTime() - toleranceMs;
    const hi = at.getTime() + toleranceMs;
    let l = 0;
    let r = g.length;
    while (l < r) {
      const m = (l + r) >> 1;
      if (g[m].t < lo) l = m + 1;
      else r = m;
    }
    const out: T[] = [];
    for (let i = l; i < g.length && g[i].t <= hi; i++) out.push(g[i].item);
    return out;
  }
}

/** Match each candidate to an existing trade of the same account (exact first, then possible). */
export function findExistingDuplicates(
  accountId: string,
  candidates: DuplicateCandidate[],
  existing: ExistingTradeLite[],
  toleranceSec = DUPLICATE_TOLERANCE_SEC,
): ExistingDuplicate[] {
  const byFingerprint = new Map<string, string>();
  for (const e of existing) {
    byFingerprint.set(tradeFingerprint(fpInput(accountId, e)), e.id);
    if (e.fingerprint) byFingerprint.set(e.fingerprint, e.id);
  }
  const index = new OpenTimeIndex(existing);
  const out: ExistingDuplicate[] = [];
  for (const c of candidates) {
    const exact = byFingerprint.get(candidateFingerprint(accountId, c));
    if (exact) {
      out.push({ row: c.row, kind: "exact", tradeId: exact });
      continue;
    }
    const loose = fpInput(accountId, c, true);
    const match = index
      .near(c.symbol, c.direction, c.openedAt, toleranceSec * 1000)
      .find((e) => isPossibleDuplicate(loose, fpInput(accountId, e), toleranceSec));
    if (match) out.push({ row: c.row, kind: "possible", tradeId: match.id });
  }
  return out;
}

/** Rows that repeat an earlier row of the same file. The first occurrence is never flagged. */
export function findFileDuplicates(accountId: string, candidates: DuplicateCandidate[], toleranceSec = DUPLICATE_TOLERANCE_SEC): FileDuplicate[] {
  const ordered = [...candidates].sort((a, b) => a.row - b.row);
  const firstByFp = new Map<string, number>();
  const index = new OpenTimeIndex(ordered);
  /** Duplicate row → the original it repeats (so chains point at the first occurrence). */
  const origin = new Map<number, number>();
  const out: FileDuplicate[] = [];
  for (const c of ordered) {
    const fp = candidateFingerprint(accountId, c);
    const first = firstByFp.get(fp);
    if (first !== undefined) {
      origin.set(c.row, first);
      out.push({ row: c.row, kind: "exact", ofRow: first });
      continue;
    }
    firstByFp.set(fp, c.row);
    const loose = fpInput(accountId, c, true);
    const earlier = index
      .near(c.symbol, c.direction, c.openedAt, toleranceSec * 1000)
      .filter((o) => o.row < c.row)
      .sort((a, b) => a.row - b.row)
      .find((o) => isPossibleDuplicate(loose, fpInput(accountId, o, true), toleranceSec));
    if (earlier) {
      const ofRow = origin.get(earlier.row) ?? earlier.row;
      origin.set(c.row, ofRow);
      out.push({ row: c.row, kind: "possible", ofRow });
    }
  }
  return out;
}
