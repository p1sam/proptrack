/**
 * Trade identity for duplicate detection. Two records with the same account, symbol, direction,
 * entry/exit minute, entry/exit price and quantity are treated as the same trade.
 */
export interface FingerprintInput {
  accountId: string;
  symbol: string;
  direction: "LONG" | "SHORT";
  openedAt: Date;
  entryPrice: number;
  closedAt?: Date | null;
  exitPrice?: number | null;
  quantity: number;
}

const minute = (d: Date | null | undefined) => (d ? new Date(Math.floor(d.getTime() / 60000) * 60000).toISOString().slice(0, 16) : "-");
const px = (n: number | null | undefined) => (n === null || n === undefined ? "-" : Number(n.toPrecision(10)).toString());

export function tradeFingerprint(t: FingerprintInput): string {
  return [t.accountId, t.symbol.toUpperCase(), t.direction, minute(t.openedAt), px(t.entryPrice), minute(t.closedAt), px(t.exitPrice), px(t.quantity)].join("|");
}

/**
 * Looser match used to warn about *possible* duplicates: same account/symbol/direction/quantity,
 * entry within `toleranceSec`, and entry price within a relative 1e-6.
 */
export function isPossibleDuplicate(a: FingerprintInput, b: FingerprintInput, toleranceSec = 60): boolean {
  if (a.accountId !== b.accountId || a.symbol.toUpperCase() !== b.symbol.toUpperCase() || a.direction !== b.direction) return false;
  if (Math.abs(a.quantity - b.quantity) > 1e-9) return false;
  if (Math.abs(a.openedAt.getTime() - b.openedAt.getTime()) > toleranceSec * 1000) return false;
  const rel = (x: number, y: number) => Math.abs(x - y) <= Math.max(Math.abs(x), Math.abs(y)) * 1e-6;
  if (!rel(a.entryPrice, b.entryPrice)) return false;
  if (a.exitPrice != null && b.exitPrice != null && !rel(a.exitPrice, b.exitPrice)) return false;
  if (a.closedAt && b.closedAt && Math.abs(a.closedAt.getTime() - b.closedAt.getTime()) > toleranceSec * 1000) return false;
  return true;
}
