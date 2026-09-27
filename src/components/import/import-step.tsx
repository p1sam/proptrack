"use client";

import Link from "next/link";
import { CheckCircle2, Loader2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ConfirmUndo } from "./import-history";

export interface ImportOutcome {
  batchId: string;
  accountId: string;
  accountName: string;
  imported: number;
  skippedDuplicates: number;
  skippedErrors: number;
  skippedLines: number;
  instrumentsCreated: number;
  undone?: boolean;
}

export function ImportStep({
  accountName,
  toImport,
  duplicatesSkipped,
  duplicatesAllowed,
  errors,
  skippedLines,
  importing,
  progress,
  outcome,
  onImport,
  onUndo,
  onReset,
  undoing,
}: {
  accountName: string;
  toImport: number;
  duplicatesSkipped: number;
  duplicatesAllowed: number;
  errors: number;
  skippedLines: number;
  importing: boolean;
  progress: number;
  outcome: ImportOutcome | null;
  onImport: () => void;
  onUndo: () => void;
  onReset: () => void;
  undoing: boolean;
}) {
  if (outcome) {
    return (
      <div className="flex flex-col items-center gap-4 py-6 text-center" role="status" aria-live="polite">
        {outcome.undone ? <Undo2 className="size-7 text-muted-foreground" aria-hidden /> : <CheckCircle2 className="size-7 text-profit" aria-hidden />}
        <div>
          <p className="text-base font-semibold">
            {outcome.undone ? "Import undone" : `Imported ${outcome.imported.toLocaleString("en-US")} trade${outcome.imported === 1 ? "" : "s"} into ${outcome.accountName}`}
          </p>
          {!outcome.undone && (
            <p className="mt-1 text-sm text-muted-foreground">
              {outcome.skippedDuplicates} duplicate{outcome.skippedDuplicates === 1 ? "" : "s"} skipped · {outcome.skippedErrors} row{outcome.skippedErrors === 1 ? "" : "s"} with errors · {outcome.skippedLines} non-trade line
              {outcome.skippedLines === 1 ? "" : "s"}
              {outcome.instrumentsCreated > 0 && <> · {outcome.instrumentsCreated} new instrument{outcome.instrumentsCreated === 1 ? "" : "s"} (point value 1 — adjust in Settings if P&amp;L is calculated from prices)</>}
            </p>
          )}
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          {!outcome.undone && (
            <Button asChild>
              <Link href={`/trades?accounts=${outcome.accountId}`}>View trades</Link>
            </Button>
          )}
          {!outcome.undone && (
            <Button asChild variant="outline">
              <a href={`#batch-${outcome.batchId}`}>View batch</a>
            </Button>
          )}
          {!outcome.undone && outcome.imported > 0 && (
            <ConfirmUndo count={outcome.imported} onConfirm={onUndo} pending={undoing}>
              <Button type="button" variant="destructive" disabled={undoing}>
                {undoing ? <Loader2 className="animate-spin" /> : <Undo2 />} Undo this import
              </Button>
            </ConfirmUndo>
          )}
          <Button type="button" variant="ghost" onClick={onReset}>
            Import another file
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[max-content_1fr]">
        <dt className="text-muted-foreground">Account</dt>
        <dd className="font-medium">{accountName}</dd>
        <dt className="text-muted-foreground">Trades to import</dt>
        <dd className="font-medium tabular">
          {toImport.toLocaleString("en-US")}
          {duplicatesAllowed > 0 && <span className="font-normal text-warning"> (incl. {duplicatesAllowed} duplicates you chose to keep)</span>}
        </dd>
        <dt className="text-muted-foreground">Skipped</dt>
        <dd className="tabular">
          {duplicatesSkipped} duplicates · {errors} rows with errors · {skippedLines} non-trade lines
        </dd>
      </dl>
      <p className="text-xs text-muted-foreground">
        Trades are saved with source “CSV” and linked to this import, so you can undo it in one click. Account balances, rule checks and daily stats are recalculated afterwards.
      </p>
      {importing ? (
        <div className="flex flex-col gap-2" role="status">
          <p className="flex items-center gap-2 text-sm">
            <Loader2 className="size-4 animate-spin" aria-hidden /> Importing… {Math.round(progress)}%
          </p>
          <Progress value={progress} aria-label="Import progress" />
        </div>
      ) : (
        <div>
          <Button type="button" onClick={onImport} disabled={toImport === 0}>
            Import {toImport.toLocaleString("en-US")} trade{toImport === 1 ? "" : "s"}
          </Button>
          {toImport === 0 && <p className="mt-2 text-xs text-muted-foreground">Nothing to import — every row is a duplicate or has errors.</p>}
        </div>
      )}
    </div>
  );
}
