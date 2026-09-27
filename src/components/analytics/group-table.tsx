import Link from "next/link";
import type { GroupStats } from "@/lib/calc/stats";
import { formatMoney, formatPct, formatRatio } from "@/lib/format";
import { Pnl, RValue } from "@/components/app/pnl";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

/**
 * Per-group performance table (strategy, instrument, session, ...). Rows are listed in the
 * order given; nothing is labelled "best" — the reader compares the numbers.
 */
export function GroupTable<R extends GroupStats = GroupStats>({
  rows,
  currency,
  label = "Group",
  hrefFor,
  labelSuffix,
  caption,
  columns = ["trades", "winRate", "netPnl", "averageR", "profitFactor", "expectancy", "maxDrawdown"],
}: {
  rows: R[];
  currency: string;
  label?: string;
  hrefFor?: (row: R) => string | null;
  /** Optional extra content after the row label (e.g. a badge). */
  labelSuffix?: (row: R) => React.ReactNode;
  /** Visually hidden table caption for screen readers. */
  caption?: string;
  columns?: ("trades" | "winRate" | "netPnl" | "averageR" | "profitFactor" | "expectancy" | "maxDrawdown" | "best" | "worst")[];
}) {
  if (!rows.length) return <p className="py-6 text-center text-sm text-muted-foreground">No trades.</p>;
  const has = (c: (typeof columns)[number]) => columns.includes(c);
  return (
    <div className="overflow-x-auto">
      <Table>
        {caption && <caption className="sr-only">{caption}</caption>}
        <TableHeader>
          <TableRow>
            <TableHead>{label}</TableHead>
            {has("trades") && <TableHead className="text-right">Trades</TableHead>}
            {has("winRate") && <TableHead className="text-right">Win rate</TableHead>}
            {has("netPnl") && <TableHead className="text-right">Net P&amp;L</TableHead>}
            {has("averageR") && <TableHead className="text-right">Avg R</TableHead>}
            {has("profitFactor") && <TableHead className="text-right">Profit factor</TableHead>}
            {has("expectancy") && <TableHead className="text-right">Expectancy</TableHead>}
            {has("maxDrawdown") && <TableHead className="text-right">Max DD</TableHead>}
            {has("best") && <TableHead className="text-right">Best</TableHead>}
            {has("worst") && <TableHead className="text-right">Worst</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => {
            const href = hrefFor?.(r);
            return (
              <TableRow key={r.key}>
                <TableCell className="font-medium">
                  {href ? (
                    <Link href={href} className="hover:underline">
                      {r.label}
                    </Link>
                  ) : (
                    r.label
                  )}
                  {labelSuffix?.(r)}
                </TableCell>
                {has("trades") && <TableCell className="text-right tabular">{r.trades}</TableCell>}
                {has("winRate") && <TableCell className="text-right tabular">{formatPct(r.winRate)}</TableCell>}
                {has("netPnl") && (
                  <TableCell className="text-right">
                    <Pnl value={r.netPnl} currency={currency} />
                  </TableCell>
                )}
                {has("averageR") && (
                  <TableCell className="text-right" title={`${r.tradesWithR} of ${r.trades} trades have a defined risk`}>
                    <RValue value={r.averageR} />
                  </TableCell>
                )}
                {has("profitFactor") && <TableCell className="text-right tabular">{r.profitFactor === null ? (r.wins > 0 ? "∞" : "—") : formatRatio(r.profitFactor)}</TableCell>}
                {has("expectancy") && (
                  <TableCell className="text-right">
                    <Pnl value={r.expectancy} currency={currency} />
                  </TableCell>
                )}
                {has("maxDrawdown") && <TableCell className="text-right tabular text-muted-foreground">{r.maxDrawdown ? formatMoney(-r.maxDrawdown, currency) : "—"}</TableCell>}
                {has("best") && (
                  <TableCell className="text-right">
                    <Pnl value={r.bestTrade} currency={currency} />
                  </TableCell>
                )}
                {has("worst") && (
                  <TableCell className="text-right">
                    <Pnl value={r.worstTrade} currency={currency} />
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

