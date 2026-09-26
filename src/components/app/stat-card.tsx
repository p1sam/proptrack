import { Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function StatCard({
  label,
  value,
  sub,
  hint,
  className,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  hint?: string;
  className?: string;
  tone?: "profit" | "loss" | "warning" | "neutral";
}) {
  return (
    <div className={cn("rounded-lg border bg-card px-4 py-3", className)}>
      <div className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
        <span className="truncate">{label}</span>
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
      </div>
      <div
        className={cn(
          "mt-1 text-xl font-semibold tabular tracking-tight",
          tone === "profit" && "text-profit",
          tone === "loss" && "text-loss",
          tone === "warning" && "text-warning",
        )}
      >
        {value}
      </div>
      {sub && <div className="mt-0.5 text-xs text-muted-foreground tabular">{sub}</div>}
    </div>
  );
}

export function StatGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8", className)}>{children}</div>;
}
