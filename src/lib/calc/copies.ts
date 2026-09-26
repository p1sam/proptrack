import { D, mean, roundMoney } from "./money";

/**
 * Multi-account trade copies. A trade idea taken on several accounts is stored as one Trade
 * per account (each account's balance is real money and must see its own copy), linked by
 * `groupId`. For trader-level statistics (win rate, R, trade counts) those copies are
 * collapsed into one unit so a single idea is not counted three times; money is summed.
 */

export interface CopyableTrade {
  id: string;
  groupId?: string | null;
  netPnl: number;
  grossPnl?: number | null;
  commission?: number | null;
  swap?: number | null;
  rMultiple?: number | null;
  riskPercent?: number | null;
  initialRisk?: number | null;
  quantity?: number;
  openedAt: Date;
  closedAt: Date;
}

export type Collapsed<T extends CopyableTrade> = T & { copies: number; memberIds: string[] };

export function collapseCopies<T extends CopyableTrade>(trades: T[]): Collapsed<T>[] {
  const out: Collapsed<T>[] = [];
  const groups = new Map<string, T[]>();
  for (const t of trades) {
    if (!t.groupId) {
      out.push({ ...t, copies: 1, memberIds: [t.id] });
      continue;
    }
    const arr = groups.get(t.groupId) ?? [];
    arr.push(t);
    groups.set(t.groupId, arr);
  }
  for (const list of groups.values()) {
    const primary = [...list].sort((a, b) => a.openedAt.getTime() - b.openedAt.getTime() || a.id.localeCompare(b.id))[0];
    const sum = (f: (t: T) => number | null | undefined) => roundMoney(list.reduce((acc, t) => acc.plus(D(f(t) ?? 0)), D(0)));
    const rs = list.map((t) => t.rMultiple).filter((r): r is number => r != null);
    const rp = list.map((t) => t.riskPercent).filter((r): r is number => r != null);
    out.push({
      ...primary,
      netPnl: sum((t) => t.netPnl),
      grossPnl: sum((t) => t.grossPnl),
      commission: sum((t) => t.commission),
      swap: sum((t) => t.swap),
      initialRisk: list.some((t) => t.initialRisk != null) ? sum((t) => t.initialRisk) : null,
      rMultiple: rs.length ? mean(rs) : null,
      riskPercent: rp.length ? mean(rp) : null,
      openedAt: new Date(Math.min(...list.map((t) => t.openedAt.getTime()))),
      closedAt: new Date(Math.max(...list.map((t) => t.closedAt.getTime()))),
      copies: list.length,
      memberIds: list.map((t) => t.id),
    });
  }
  return out.sort((a, b) => a.closedAt.getTime() - b.closedAt.getTime() || a.id.localeCompare(b.id));
}
