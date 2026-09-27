"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pnl, RValue } from "@/components/app/pnl";
import { Sparkline } from "@/components/charts/sparkline";
import { SERIES_COLORS as COMPARE_COLORS } from "@/components/charts/palette";
import { formatMoney, formatPct, formatRatio } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface StrategyTableRow {
  key: string;
  label: string;
  archived: boolean;
  trades: number;
  wins: number;
  winRate: number | null;
  netPnl: number;
  averageR: number | null;
  tradesWithR: number;
  profitFactor: number | null;
  expectancy: number | null;
  maxDrawdown: number;
  bestTrade: number | null;
  worstTrade: number | null;
  spark: number[];
}

type SortKey = "label" | "trades" | "winRate" | "netPnl" | "averageR" | "profitFactor" | "expectancy" | "maxDrawdown" | "bestTrade" | "worstTrade";

const COLUMNS: { key: SortKey; label: string; hint?: string }[] = [
  { key: "trades", label: "Trades" },
  { key: "winRate", label: "Win rate", hint: "Wins ÷ (wins + losses)" },
  { key: "netPnl", label: "Net P&L" },
  { key: "averageR", label: "Avg R", hint: "Mean R of trades with defined risk" },
  { key: "profitFactor", label: "Profit factor", hint: "Gross profit ÷ gross loss" },
  { key: "expectancy", label: "Expectancy", hint: "Average net P&L per trade" },
  { key: "maxDrawdown", label: "Max DD", hint: "Largest peak-to-trough decline of this strategy's cumulative P&L" },
  { key: "bestTrade", label: "Best" },
  { key: "worstTrade", label: "Worst" },
];

/**
 * All strategies with their metrics. Default order is by name; any column can be sorted. Nothing is
 * ranked or labelled — the reader compares. Checkboxes pick up to `max` strategies for comparison
 * (URL param `compare`), and the colour swatch shows each one's fixed series colour.
 */
export function StrategyTable({ rows, currency, max, query }: { rows: StrategyTableRow[]; currency: string; max: number; query: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "label", dir: "asc" });
  const compare = (params.get("compare") ?? "").split(",").filter(Boolean);

  const sorted = useMemo(() => {
    const out = [...rows];
    out.sort((a, b) => {
      if (sort.key === "label") return a.label.localeCompare(b.label) * (sort.dir === "asc" ? 1 : -1);
      const av = a[sort.key];
      const bv = b[sort.key];
      // Missing values always sort last, whichever the direction.
      if (av === null && bv === null) return a.label.localeCompare(b.label);
      if (av === null) return 1;
      if (bv === null) return -1;
      return (av - bv) * (sort.dir === "asc" ? 1 : -1) || a.label.localeCompare(b.label);
    });
    return out;
  }, [rows, sort]);

  const toggleSort = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "label" ? "asc" : "desc" }));
  const toggleCompare = (key: string, on: boolean) => {
    const next = on ? [...compare, key].slice(0, max) : compare.filter((k) => k !== key);
    const sp = new URLSearchParams(params);
    if (next.length) sp.set("compare", next.join(","));
    else sp.delete("compare");
    start(() => router.push(`${pathname}${sp.size ? `?${sp}` : ""}`, { scroll: false }));
  };

  const sortHead = (k: SortKey, label: string, hint?: string, right = true) => {
    const active = sort.key === k;
    const Icon = !active ? ArrowUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
    return (
      <TableHead key={k} className={right ? "text-right" : undefined} aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
        <button type="button" onClick={() => toggleSort(k)} title={hint} className={cn("inline-flex items-center gap-1 hover:text-foreground", right && "flex-row-reverse")}>
          {label}
          <Icon className={cn("size-3", !active && "opacity-40")} aria-hidden />
        </button>
      </TableHead>
    );
  };

  return (
    <div className={cn("transition-opacity", pending && "opacity-60")}>
      <Table>
        <caption className="sr-only">Strategies — select up to {max} to compare</caption>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">
              <span className="sr-only">Compare</span>
            </TableHead>
            {sortHead("label", "Strategy", undefined, false)}
            <TableHead>Cumulative P&amp;L</TableHead>
            {COLUMNS.map((c) => sortHead(c.key, c.label, c.hint))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((r) => {
            const idx = compare.indexOf(r.key);
            const checked = idx >= 0;
            return (
              <TableRow key={r.key} data-state={checked ? "selected" : undefined}>
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    <Checkbox
                      checked={checked}
                      disabled={!checked && compare.length >= max}
                      onCheckedChange={(v) => toggleCompare(r.key, v === true)}
                      aria-label={`Compare ${r.label}`}
                    />
                    {checked && <span className="h-0.5 w-3 rounded-full" style={{ background: COMPARE_COLORS[idx] }} aria-hidden />}
                  </div>
                </TableCell>
                <TableCell className="font-medium">
                  <Link href={`/strategies/${r.key}${query}`} className="hover:underline">
                    {r.label}
                  </Link>
                  {r.archived && (
                    <Badge variant="outline" className="ml-1.5 text-[10px]">
                      archived
                    </Badge>
                  )}
                </TableCell>
                <TableCell>
                  <Sparkline values={r.spark} currency={currency} width={110} height={28} />
                </TableCell>
                <TableCell className="text-right tabular">{r.trades}</TableCell>
                <TableCell className="text-right tabular">{formatPct(r.winRate)}</TableCell>
                <TableCell className="text-right">{r.trades ? <Pnl value={r.netPnl} currency={currency} /> : <span className="text-muted-foreground">—</span>}</TableCell>
                <TableCell className="text-right" title={`${r.tradesWithR} of ${r.trades} trades have a defined risk`}>
                  <RValue value={r.averageR} />
                </TableCell>
                <TableCell className="text-right tabular">{r.profitFactor === null ? (r.wins > 0 ? "∞" : "—") : formatRatio(r.profitFactor)}</TableCell>
                <TableCell className="text-right">
                  <Pnl value={r.expectancy} currency={currency} />
                </TableCell>
                <TableCell className="text-right tabular text-muted-foreground">{r.maxDrawdown ? formatMoney(-r.maxDrawdown, currency) : "—"}</TableCell>
                <TableCell className="text-right">
                  <Pnl value={r.bestTrade} currency={currency} />
                </TableCell>
                <TableCell className="text-right">
                  <Pnl value={r.worstTrade} currency={currency} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
