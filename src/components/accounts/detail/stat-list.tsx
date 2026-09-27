import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/** [label, value, optional hint] */
export type StatRow = [string, React.ReactNode, string?];

export function StatList({ rows }: { rows: StatRow[] }) {
  return (
    <dl className="flex flex-col divide-y text-sm">
      {rows.map(([label, value, hint]) => (
        <div key={label} className="flex items-start justify-between gap-3 py-1.5 first:pt-0 last:pb-0">
          <dt className="flex items-center gap-1 text-muted-foreground">
            {label}
            {hint && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" aria-label={`About ${label}`} className="text-muted-foreground/70 hover:text-foreground">
                    <Info className="size-3" />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-64">{hint}</TooltipContent>
              </Tooltip>
            )}
          </dt>
          <dd className="text-right tabular">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
