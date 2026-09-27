import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getAccountTrades } from "@/server/queries/account-detail";
import { formatDateTime, formatNumber } from "@/lib/format";
import { Section } from "@/components/app/page-header";
import { Pnl, RValue } from "@/components/app/pnl";
import { EmptyState } from "@/components/app/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export async function TradesTab({ userId, accountId, currency, timezone }: { userId: string; accountId: string; currency: string; timezone: string }) {
  const { rows, total } = await getAccountTrades(userId, accountId, 50);
  const openLink = `/trades?accounts=${accountId}&status=ALL`;
  if (!rows.length) {
    return (
      <EmptyState
        title="No trades on this account yet"
        description="Add trades manually or import them from your platform's CSV export."
        action={
          <div className="flex gap-2">
            <Button asChild size="sm">
              <Link href="/trades/new">Add trade</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/trades/import">Import</Link>
            </Button>
          </div>
        }
      />
    );
  }
  return (
    <Section
      title="Trades"
      description={total > rows.length ? `Latest ${rows.length} of ${total}` : `${total} trade${total === 1 ? "" : "s"}`}
      actions={
        <Link href={openLink} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          Open in Trades <ArrowRight className="size-3" aria-hidden />
        </Link>
      }
    >
      <div className="-mx-4 -my-4 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">Closed</TableHead>
              <TableHead>Symbol</TableHead>
              <TableHead>Side</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead className="text-right">Entry</TableHead>
              <TableHead className="text-right">Exit</TableHead>
              <TableHead className="hidden md:table-cell">Strategy</TableHead>
              <TableHead className="text-right">R</TableHead>
              <TableHead className="pr-4 text-right">Net P&amp;L</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="pl-4 text-xs text-muted-foreground tabular">
                  <Link href={`/trades/${t.id}`} className="hover:text-foreground hover:underline">
                    {formatDateTime(t.closedAt ?? t.openedAt, timezone)}
                  </Link>
                </TableCell>
                <TableCell className="font-medium">
                  <Link href={`/trades/${t.id}`} className="hover:underline">
                    {t.symbol}
                  </Link>
                  {t.copied && <Badge variant="outline" className="ml-1.5 text-[10px]">copy</Badge>}
                </TableCell>
                <TableCell className={t.direction === "LONG" ? "text-profit" : "text-loss"}>{t.direction === "LONG" ? "Long" : "Short"}</TableCell>
                <TableCell className="text-right tabular">{formatNumber(t.quantity, 4)}</TableCell>
                <TableCell className="text-right tabular">{formatNumber(t.entryPrice, 5)}</TableCell>
                <TableCell className="text-right tabular">{t.exitPrice === null ? "—" : formatNumber(t.exitPrice, 5)}</TableCell>
                <TableCell className="hidden max-w-40 truncate text-muted-foreground md:table-cell">{t.strategy ?? "—"}</TableCell>
                <TableCell className="text-right">
                  <RValue value={t.rMultiple} />
                </TableCell>
                <TableCell className="pr-4 text-right">{t.status === "OPEN" ? <Badge variant="secondary">Open</Badge> : <Pnl value={t.netPnl} currency={currency} />}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {total > rows.length && (
        <div className="mt-6 text-center">
          <Button asChild variant="outline" size="sm">
            <Link href={openLink}>View all {total} trades</Link>
          </Button>
        </div>
      )}
    </Section>
  );
}
