"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Loader2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { formatDateTime } from "@/lib/format";
import { undoImport } from "@/server/actions/import";
import type { ImportBatchRow } from "@/server/queries/import-batches";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

/** Confirmation dialog before deleting an import's trades. */
export function ConfirmUndo({ count, onConfirm, pending, children }: { count: number; onConfirm: () => void; pending?: boolean; children: React.ReactNode }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{children}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Undo this import?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently deletes the {count.toLocaleString("en-US")} trade{count === 1 ? "" : "s"} created by this import, including any journal notes, tags or screenshots you added to them since.
            The account is recalculated afterwards.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep trades</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onConfirm} disabled={pending}>
            Delete {count.toLocaleString("en-US")} trade{count === 1 ? "" : "s"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

const SOURCE_LABELS: Record<string, string> = { "generic-csv": "CSV", "mt5-positions-csv": "MT5 positions" };

export function ImportHistory({ batches, timezone, onUndone }: { batches: ImportBatchRow[]; timezone: string; onUndone?: (batchId: string) => void }) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const undo = (b: ImportBatchRow) => {
    setPendingId(b.id);
    startTransition(async () => {
      const res = await undoImport({ batchId: b.id });
      setPendingId(null);
      if (res.ok) {
        toast.success(`Import undone — ${res.data.deleted} trade${res.data.deleted === 1 ? "" : "s"} deleted`);
        onUndone?.(b.id);
      } else toast.error(res.error);
    });
  };

  if (!batches.length) return <p className="text-sm text-muted-foreground">No imports yet.</p>;

  return (
    <div className="-mx-4 -my-4 overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="sr-only">Recent imports</caption>
        <thead className="border-b text-left text-xs text-muted-foreground">
          <tr>
            {["Imported", "File", "Account", "Format", "Rows", "Imported", "Skipped", "Trades now", ""].map((h, i) => (
              <th key={i} scope="col" className="px-4 py-2 font-medium whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">
          {batches.map((b) => (
            <tr key={b.id} id={`batch-${b.id}`} className="scroll-mt-20 target:bg-muted/50">
              <td className="px-4 py-2 whitespace-nowrap tabular">{formatDateTime(b.createdAt, timezone)}</td>
              <td className="max-w-48 truncate px-4 py-2" title={b.filename ?? undefined}>
                {b.filename ?? "—"}
              </td>
              <td className="px-4 py-2 whitespace-nowrap">
                <Link href={`/trades?accounts=${b.account.id}`} className="hover:underline">
                  {b.account.name}
                </Link>
              </td>
              <td className="px-4 py-2 whitespace-nowrap text-muted-foreground">{SOURCE_LABELS[b.source] ?? b.source}</td>
              <td className="px-4 py-2 tabular">{b.rowCount.toLocaleString("en-US")}</td>
              <td className="px-4 py-2 tabular">{b.importedCount.toLocaleString("en-US")}</td>
              <td className="px-4 py-2 tabular">{b.skippedCount.toLocaleString("en-US")}</td>
              <td className="px-4 py-2 tabular">{b.tradeCount.toLocaleString("en-US")}</td>
              <td className="px-4 py-2 text-right">
                {b.tradeCount > 0 ? (
                  <ConfirmUndo count={b.tradeCount} onConfirm={() => undo(b)} pending={pendingId === b.id}>
                    <Button type="button" variant="ghost" size="sm" disabled={pendingId === b.id} aria-label={`Undo import of ${b.filename ?? "file"} from ${formatDateTime(b.createdAt, timezone)}`}>
                      {pendingId === b.id ? <Loader2 className="animate-spin" /> : <Undo2 />} Undo
                    </Button>
                  </ConfirmUndo>
                ) : (
                  <span className="text-xs text-muted-foreground">No trades left</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
