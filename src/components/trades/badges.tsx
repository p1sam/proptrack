import { cn } from "@/lib/utils";

export function DirectionBadge({ direction, className }: { direction: "LONG" | "SHORT"; className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px] font-medium", direction === "LONG" ? "border-profit/30 bg-profit/10 text-profit" : "border-loss/30 bg-loss/10 text-loss", className)}>
      {direction === "LONG" ? "Long" : "Short"}
    </span>
  );
}

export function OpenBadge({ className }: { className?: string }) {
  return <span className={cn("inline-flex items-center rounded-md border border-chart-1/30 bg-chart-1/15 px-1.5 py-0.5 text-[11px] font-medium text-chart-1", className)}>Open</span>;
}

export function CopyBadge({ className, title }: { className?: string; title?: string }) {
  return (
    <span title={title ?? "Linked copy of a trade on other accounts"} className={cn("inline-flex items-center rounded-md border px-1 py-px text-[10px] text-muted-foreground", className)}>
      copy
    </span>
  );
}
