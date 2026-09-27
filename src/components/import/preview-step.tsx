"use client";

import { useMemo, useState } from "react";
import { calculateNetPnl } from "@/lib/calc/trade";
import { formatDateTime, formatNumber } from "@/lib/format";
import type { NormalizedRow, NormalizeSummary } from "@/lib/import/normalize";
import { cn } from "@/lib/utils";
import { Pnl } from "@/components/app/pnl";
import { Badge } from "@/components/ui/badge";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

export const PREVIEW_LIMIT = 100;

type Filter = "all" | "issues" | "error" | "skipped";

export function StatusBadge({ status }: { status: NormalizedRow["status"] }) {
  if (status === "ok") return <Badge variant="outline" className="text-profit">OK</Badge>;
  if (status === "warning") return <Badge variant="outline" className="text-warning">Warning</Badge>;
  if (status === "error") return <Badge variant="destructive">Error</Badge>;
  return <Badge variant="secondary">Skipped</Badge>;
}

export function PreviewStep({ rows, summary, displayTz, currency }: { rows: NormalizedRow[]; summary: NormalizeSummary; displayTz: string; currency: string }) {
  const [filter, setFilter] = useState<Filter>(summary.error ? "error" : "all");
  const filtered = useMemo(() => {
    if (filter === "all") return rows;
    if (filter === "issues") return rows.filter((r) => r.status === "warning" || r.status === "error");
    return rows.filter((r) => r.status === filter);
  }, [rows, filter]);
  const shown = filtered.slice(0, PREVIEW_LIMIT);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          ["Ready", summary.ok, "text-profit"],
          ["With warnings", summary.warning, "text-warning"],
          ["Errors (left out)", summary.error, "text-loss"],
          ["Skipped lines", summary.skipped, "text-muted-foreground"],
        ].map(([label, n, tone]) => (
          <div key={label as string} className="rounded-md border bg-muted/20 px-3 py-2">
            <div className={cn("text-lg font-semibold tabular", tone as string)}>{(n as number).toLocaleString("en-US")}</div>
            <div className="text-xs text-muted-foreground">{label}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <ToggleGroup type="single" value={filter} onValueChange={(v) => v && setFilter(v as Filter)} variant="outline" size="sm" aria-label="Filter rows">
          <ToggleGroupItem value="all">All ({rows.length})</ToggleGroupItem>
          <ToggleGroupItem value="issues">Issues ({summary.warning + summary.error})</ToggleGroupItem>
          <ToggleGroupItem value="error">Errors ({summary.error})</ToggleGroupItem>
          <ToggleGroupItem value="skipped">Skipped ({summary.skipped})</ToggleGroupItem>
        </ToggleGroup>
        <p className="text-xs text-muted-foreground">
          Showing {shown.length} of {filtered.length.toLocaleString("en-US")} · times in {displayTz}
        </p>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-xs">
          <caption className="sr-only">Normalized trades preview</caption>
          <thead className="bg-muted/40 text-left">
            <tr>
              {["Row", "Status", "Symbol", "Side", "Opened", "Closed", "Qty", "Entry", "Exit", "SL", "Comm.", "Swap", "Net P&L", "Notes"].map((h) => (
                <th key={h} scope="col" className="px-2 py-1.5 font-medium whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {shown.map((r) => {
              const t = r.trade;
              const net = t && t.grossPnl !== null ? calculateNetPnl(t.grossPnl, t.commission, t.swap) : null;
              return (
                <tr key={r.rowIndex} className={cn(r.status === "error" && "bg-destructive/5")}>
                  <td className="px-2 py-1 tabular text-muted-foreground">{r.rowIndex + 1}</td>
                  <td className="px-2 py-1">
                    <StatusBadge status={r.status} />
                  </td>
                  {t ? (
                    <>
                      <td className="px-2 py-1 font-medium">{t.symbol}</td>
                      <td className={cn("px-2 py-1", t.direction === "LONG" ? "text-profit" : "text-loss")}>{t.direction === "LONG" ? "Long" : "Short"}</td>
                      <td className="px-2 py-1 whitespace-nowrap tabular">{formatDateTime(t.openedAt, displayTz)}</td>
                      <td className="px-2 py-1 whitespace-nowrap tabular">{t.closedAt ? formatDateTime(t.closedAt, displayTz) : <Badge variant="secondary">Open</Badge>}</td>
                      <td className="px-2 py-1 tabular">{formatNumber(t.quantity, 6)}</td>
                      <td className="px-2 py-1 tabular">{formatNumber(t.entryPrice, 8)}</td>
                      <td className={cn("px-2 py-1 tabular", !t.exitPriceKnown && "text-muted-foreground italic")}>{t.exitPrice === null ? "—" : formatNumber(t.exitPrice, 8)}</td>
                      <td className="px-2 py-1 tabular">{formatNumber(t.stopLoss, 8)}</td>
                      <td className="px-2 py-1 tabular">{t.commission ? formatNumber(t.commission) : "—"}</td>
                      <td className="px-2 py-1 tabular">{t.swap ? formatNumber(t.swap) : "—"}</td>
                      <td className="px-2 py-1 whitespace-nowrap">{net !== null ? <Pnl value={net} currency={currency} /> : <span className="text-muted-foreground">{t.closedAt ? "from prices" : "—"}</span>}</td>
                    </>
                  ) : (
                    <td colSpan={11} className="px-2 py-1 text-muted-foreground">
                      {r.skipReason ?? ""}
                    </td>
                  )}
                  <td className="min-w-48 px-2 py-1">
                    {r.errors.map((e) => (
                      <div key={e} className="text-loss">
                        {e}
                      </div>
                    ))}
                    {r.warnings.map((w) => (
                      <div key={w} className="text-warning">
                        {w}
                      </div>
                    ))}
                  </td>
                </tr>
              );
            })}
            {!shown.length && (
              <tr>
                <td colSpan={14} className="px-2 py-6 text-center text-muted-foreground">
                  No rows in this view.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {summary.error > 0 && <p className="text-xs text-muted-foreground">Rows with errors are left out. Fix the mapping or options (date format, decimal separator, timezone) or correct the file and upload it again.</p>}
    </div>
  );
}
