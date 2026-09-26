import { AlertTriangle, Info } from "lucide-react";
import type { DatasetNotes } from "@/server/queries/analytics-page";

/** Discloses how the dataset was built: sample size, copy collapsing, excluded currencies. */
export function DatasetNotesBar({ notes, extra }: { notes: DatasetNotes; extra?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 text-xs text-muted-foreground">
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="inline-flex items-center gap-1">
          <Info className="size-3" aria-hidden />
          {notes.trades} closed trade{notes.trades === 1 ? "" : "s"} in {notes.currency}
        </span>
        {notes.collapsed && (
          <span>
            {notes.rawCount} trade records across accounts counted as {notes.trades} trade ideas — copies of one trade are collapsed for rates and counts; their money is summed.
          </span>
        )}
        {extra}
      </p>
      {notes.excluded.count > 0 && (
        <p className="inline-flex items-center gap-1 text-warning">
          <AlertTriangle className="size-3" aria-hidden />
          {notes.excluded.count} trade{notes.excluded.count === 1 ? "" : "s"} in {notes.excluded.currencies.join(", ")} excluded — no exchange rate to {notes.currency}. Add one in Settings.
        </p>
      )}
    </div>
  );
}
