"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowDown, ArrowUp, ArrowUpDown, Link2, Trash2, Unlink, X } from "lucide-react";
import { toast } from "sonner";
import { formatDateTime, formatNumber, formatPct } from "@/lib/format";
import { deleteTrades, setTradeGroup } from "@/server/actions/trades";
import type { TradeRow, TradeSort } from "@/server/queries/trades";
import { Pnl, RValue } from "@/components/app/pnl";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { CopyBadge, DirectionBadge, OpenBadge } from "./badges";
import { gradeLabel } from "./labels";
import { TagList } from "./tag-picker";

const price = (n: number | null) => (n === null ? "—" : formatNumber(n, 5));

function SortHead({ k, sort, dir, href, children, className }: { k: TradeSort; sort: TradeSort; dir: "asc" | "desc"; href: string; children: React.ReactNode; className?: string }) {
  const active = sort === k;
  const Icon = active ? (dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <th scope="col" aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"} className={cn("px-2 py-2 font-medium", className)}>
      <Link href={href} scroll={false} className={cn("inline-flex items-center gap-1 rounded hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none", active && "text-foreground")}>
        {children}
        <Icon className={cn("size-3", !active && "opacity-40")} aria-hidden />
      </Link>
    </th>
  );
}

export function TradesTable({ rows, timezone, sort, dir }: { rows: TradeRow[]; timezone: string; sort: TradeSort; dir: "asc" | "desc" }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, start] = useTransition();

  // Drop selections that are no longer on the page (after filtering/paging).
  const visible = new Set(rows.map((r) => r.id));
  const sel = [...selected].filter((id) => visible.has(id));
  const selRows = rows.filter((r) => selected.has(r.id));
  const allOn = rows.length > 0 && sel.length === rows.length;

  const toggle = (id: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const sortHref = (key: TradeSort) => {
    const sp = new URLSearchParams(params);
    const nextDir = sort === key ? (dir === "desc" ? "asc" : "desc") : key === "symbol" || key === "account" ? "asc" : "desc";
    sp.set("sort", key);
    sp.set("dir", nextDir);
    sp.delete("page");
    return `${pathname}?${sp}`;
  };

  const distinctAccounts = new Set(selRows.map((r) => r.accountId)).size === selRows.length;
  const canLink = selRows.length >= 2 && selRows.length <= 20 && distinctAccounts;
  const canUnlink = selRows.some((r) => r.groupId);

  const run = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>, success: string) =>
    start(async () => {
      const res = await fn();
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(success);
      setSelected(new Set());
      router.refresh();
    });

  return (
    <div className="grid gap-2">
      {sel.length > 0 && (
        <div role="toolbar" aria-label="Bulk actions" className="sticky top-2 z-10 flex flex-wrap items-center gap-2 rounded-lg border bg-card px-3 py-2 shadow-sm">
          <span className="text-sm font-medium tabular">{sel.length} selected</span>
          <Button size="sm" variant="outline" disabled={!canLink || pending} title={canLink ? undefined : "Select 2–20 trades on different accounts"} onClick={() => run(() => setTradeGroup({ ids: sel, link: true }), `Linked ${sel.length} trades as copies`)}>
            <Link2 /> Link as copies
          </Button>
          <Button size="sm" variant="outline" disabled={!canUnlink || pending} onClick={() => run(() => setTradeGroup({ ids: selRows.filter((r) => r.groupId).map((r) => r.id), link: false }), "Unlinked")}>
            <Unlink /> Unlink
          </Button>
          <Button size="sm" variant="destructive" disabled={pending} onClick={() => setConfirmDelete(true)}>
            <Trash2 /> Delete
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())} className="ml-auto">
            <X /> Clear
          </Button>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full min-w-[1200px] text-sm">
          <thead className="border-b bg-muted/30 text-left text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="w-8 px-3 py-2">
                <Checkbox
                  aria-label={allOn ? "Deselect all trades on this page" : "Select all trades on this page"}
                  checked={allOn ? true : sel.length ? "indeterminate" : false}
                  onCheckedChange={(v) => setSelected(v === true ? new Set(rows.map((r) => r.id)) : new Set())}
                />
              </th>
              <SortHead k="date" sort={sort} dir={dir} href={sortHref("date")}>Opened</SortHead>
              <SortHead k="account" sort={sort} dir={dir} href={sortHref("account")}>Account</SortHead>
              <SortHead k="symbol" sort={sort} dir={dir} href={sortHref("symbol")}>Symbol</SortHead>
              <th scope="col" className="px-2 py-2 font-medium">Side</th>
              <th scope="col" className="px-2 py-2 text-right font-medium">Qty</th>
              <th scope="col" className="px-2 py-2 text-right font-medium">Entry</th>
              <th scope="col" className="px-2 py-2 text-right font-medium">Exit</th>
              <th scope="col" className="px-2 py-2 text-right font-medium">Stop</th>
              <SortHead k="pnl" sort={sort} dir={dir} href={sortHref("pnl")} className="text-right">Net P&amp;L</SortHead>
              <SortHead k="r" sort={sort} dir={dir} href={sortHref("r")} className="text-right">R</SortHead>
              <SortHead k="risk" sort={sort} dir={dir} href={sortHref("risk")} className="text-right">Risk %</SortHead>
              <th scope="col" className="px-2 py-2 font-medium">Strategy</th>
              <th scope="col" className="px-2 py-2 font-medium">Session</th>
              <th scope="col" className="px-2 py-2 font-medium">Setup</th>
              <th scope="col" className="px-2 py-2 font-medium">Tags</th>
              <th scope="col" className="px-2 py-2 font-medium">Grade</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((t) => {
              const on = selected.has(t.id);
              return (
                <tr
                  key={t.id}
                  onClick={(e) => {
                    if ((e.target as HTMLElement).closest("a,button,[data-select]")) return;
                    router.push(`/trades/${t.id}`);
                  }}
                  className={cn("cursor-pointer hover:bg-muted/40", on && "bg-primary/5")}
                >
                  <td className="px-3 py-1.5" data-select>
                    <Checkbox aria-label={`Select ${t.symbol} trade on ${t.accountName}`} checked={on} onCheckedChange={(v) => toggle(t.id, v === true)} />
                  </td>
                  <td className="px-2 py-1.5 whitespace-nowrap text-muted-foreground tabular">{formatDateTime(t.openedAt, timezone)}</td>
                  <td className="max-w-44 px-2 py-1.5">
                    <span className="flex items-center gap-1">
                      <span className="truncate">{t.accountName}</span>
                      {t.groupId && <CopyBadge />}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 font-medium">
                    <Link href={`/trades/${t.id}`} className="rounded hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
                      {t.symbol}
                    </Link>
                  </td>
                  <td className="px-2 py-1.5">
                    <DirectionBadge direction={t.direction} />
                  </td>
                  <td className="px-2 py-1.5 text-right tabular">{formatNumber(t.quantity, 4)}</td>
                  <td className="px-2 py-1.5 text-right tabular">{price(t.entryPrice)}</td>
                  <td className="px-2 py-1.5 text-right tabular">{price(t.exitPrice)}</td>
                  <td className="px-2 py-1.5 text-right tabular text-muted-foreground">{price(t.stopLoss)}</td>
                  <td className="px-2 py-1.5 text-right whitespace-nowrap">{t.status === "OPEN" ? <OpenBadge /> : <Pnl value={t.netPnl} currency={t.currency} />}</td>
                  <td className="px-2 py-1.5 text-right">
                    <RValue value={t.rMultiple} />
                  </td>
                  <td className="px-2 py-1.5 text-right tabular text-muted-foreground">{formatPct(t.riskPercent)}</td>
                  <td className="max-w-32 truncate px-2 py-1.5">{t.strategy ?? <span className="text-muted-foreground">—</span>}</td>
                  <td className="max-w-28 truncate px-2 py-1.5 text-muted-foreground">{t.session ?? "—"}</td>
                  <td className="max-w-32 truncate px-2 py-1.5 text-muted-foreground">{t.setup ?? "—"}</td>
                  <td className="max-w-56 px-2 py-1.5">
                    <TagList tags={t.tags} />
                  </td>
                  <td className="px-2 py-1.5">{gradeLabel(t.grade)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {sel.length} trade{sel.length === 1 ? "" : "s"}?
            </AlertDialogTitle>
            <AlertDialogDescription>This permanently removes the trades with their exits, journal and screenshots, and recalculates the affected accounts. Linked copies on other accounts are kept.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={pending}
              onClick={(e) => {
                e.preventDefault();
                const ids = sel;
                start(async () => {
                  const res = await deleteTrades({ ids });
                  if (!res.ok) {
                    toast.error(res.error);
                    return;
                  }
                  toast.success(`Deleted ${res.data.deleted} trade${res.data.deleted === 1 ? "" : "s"}`);
                  setConfirmDelete(false);
                  setSelected(new Set());
                  router.refresh();
                });
              }}
            >
              {pending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
