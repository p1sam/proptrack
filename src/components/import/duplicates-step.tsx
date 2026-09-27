"use client";

import Link from "next/link";
import { CheckCircle2, Loader2 } from "lucide-react";
import { formatDateTime, formatNumber } from "@/lib/format";
import type { NormalizedTrade } from "@/lib/import/normalize";
import type { DuplicateReport } from "@/lib/import/duplicates";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";

export interface DupState {
  key: string;
  existing: Map<number, DuplicateReport["existing"][number]>;
  file: Map<number, DuplicateReport["file"][number]>;
}

const DUP_LIMIT = 200;

export function DuplicatesStep({
  trades,
  dup,
  checking,
  progress,
  allow,
  onAllowChange,
  onRetry,
  displayTz,
}: {
  trades: NormalizedTrade[];
  dup: DupState | null;
  checking: boolean;
  progress: number;
  allow: Set<number>;
  onAllowChange: (rows: number[], value: boolean) => void;
  onRetry: () => void;
  displayTz: string;
}) {
  if (checking || !dup) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-sm text-muted-foreground" role="status">
        {checking ? (
          <>
            <Loader2 className="size-5 animate-spin" aria-hidden />
            Checking {trades.length.toLocaleString("en-US")} trades against the account…
            <Progress value={progress} className="w-64" aria-label="Duplicate check progress" />
          </>
        ) : (
          <>
            <p>The duplicate check has not run.</p>
            <Button type="button" variant="outline" onClick={onRetry}>
              Check for duplicates
            </Button>
          </>
        )}
      </div>
    );
  }

  const dupRows = trades.filter((t) => dup.existing.has(t.rowIndex) || dup.file.has(t.rowIndex));
  const exact = dupRows.filter((t) => dup.existing.get(t.rowIndex)?.kind === "exact").length;
  const possible = dupRows.filter((t) => dup.existing.get(t.rowIndex)?.kind === "possible").length;
  const inFile = dupRows.filter((t) => !dup.existing.has(t.rowIndex)).length;
  const allowedCount = dupRows.filter((t) => allow.has(t.rowIndex)).length;
  const shown = dupRows.slice(0, DUP_LIMIT);

  if (!dupRows.length) {
    return (
      <div className="flex flex-col items-center gap-2 py-10 text-center text-sm" role="status">
        <CheckCircle2 className="size-6 text-profit" aria-hidden />
        <p className="font-medium">No duplicates found</p>
        <p className="text-muted-foreground">None of the {trades.length.toLocaleString("en-US")} trades match an existing trade of this account or another row of the file.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          ["New trades", trades.length - dupRows.length, "text-profit"],
          ["Exact duplicates", exact, "text-loss"],
          ["Possible duplicates", possible, "text-warning"],
          ["Repeated in file", inFile, "text-warning"],
        ].map(([label, n, tone]) => (
          <div key={label as string} className="rounded-md border bg-muted/20 px-3 py-2">
            <div className={`text-lg font-semibold tabular ${tone}`}>{(n as number).toLocaleString("en-US")}</div>
            <div className="text-xs text-muted-foreground">{label}</div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {allowedCount === 0 ? "All duplicates will be skipped." : `${allowedCount} of ${dupRows.length} duplicates will be imported anyway.`}
          <span className="block text-xs">Exact = same symbol, side, size, prices and minute. Possible = same symbol, side, size and entry price within 60 seconds.</span>
        </p>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => onAllowChange(dupRows.map((t) => t.rowIndex), false)}>
            Skip all duplicates
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => onAllowChange(dupRows.map((t) => t.rowIndex), true)}>
            Import all anyway
          </Button>
        </div>
      </div>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-xs">
          <caption className="sr-only">Duplicate rows</caption>
          <thead className="bg-muted/40 text-left">
            <tr>
              {["Import anyway", "Row", "Symbol", "Side", "Opened", "Qty", "Entry", "Match", "Matches"].map((h) => (
                <th key={h} scope="col" className="px-2 py-1.5 font-medium whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {shown.map((t) => {
              const ex = dup.existing.get(t.rowIndex);
              const fd = dup.file.get(t.rowIndex);
              const kind = ex?.kind ?? fd!.kind;
              return (
                <tr key={t.rowIndex}>
                  <td className="px-2 py-1">
                    <Checkbox checked={allow.has(t.rowIndex)} onCheckedChange={(v) => onAllowChange([t.rowIndex], v === true)} aria-label={`Import row ${t.rowIndex + 1} anyway`} />
                  </td>
                  <td className="px-2 py-1 tabular text-muted-foreground">{t.rowIndex + 1}</td>
                  <td className="px-2 py-1 font-medium">{t.symbol}</td>
                  <td className="px-2 py-1">{t.direction === "LONG" ? "Long" : "Short"}</td>
                  <td className="px-2 py-1 whitespace-nowrap tabular">{formatDateTime(t.openedAt, displayTz)}</td>
                  <td className="px-2 py-1 tabular">{formatNumber(t.quantity, 6)}</td>
                  <td className="px-2 py-1 tabular">{formatNumber(t.entryPrice, 8)}</td>
                  <td className="px-2 py-1">
                    <Badge variant={kind === "exact" ? "destructive" : "outline"} className={kind === "possible" ? "text-warning" : undefined}>
                      {kind === "exact" ? "Exact" : "Possible"}
                    </Badge>
                  </td>
                  <td className="px-2 py-1 whitespace-nowrap">
                    {ex ? (
                      <Link href={`/trades/${ex.trade.id}`} className="underline underline-offset-2 hover:text-foreground" target="_blank">
                        Existing {ex.trade.source === "MANUAL" ? "manual" : ex.trade.source.toLowerCase()} trade · {formatDateTime(ex.trade.openedAt, displayTz)}
                      </Link>
                    ) : (
                      <span>Row {fd!.ofRow + 1} of this file</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {dupRows.length > DUP_LIMIT && <p className="text-xs text-muted-foreground">Showing the first {DUP_LIMIT} of {dupRows.length} duplicates. The bulk buttons apply to all of them.</p>}
    </div>
  );
}
