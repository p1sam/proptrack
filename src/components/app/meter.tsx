import { cn } from "@/lib/utils";

/**
 * Horizontal progress meter. `value` is 0–100 (clamped for the bar; the caller shows the raw
 * number). Tone reflects state; the label text carries the meaning so colour is never alone.
 */
export function Meter({ value, tone = "primary", className, label }: { value: number | null | undefined; tone?: "primary" | "profit" | "loss" | "warning"; className?: string; label?: string }) {
  const v = Math.max(0, Math.min(100, value ?? 0));
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-muted", className)} role="progressbar" aria-valuenow={Math.round(v)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div
        className={cn(
          "h-full rounded-full transition-[width]",
          tone === "primary" && "bg-primary",
          tone === "profit" && "bg-profit",
          tone === "loss" && "bg-loss",
          tone === "warning" && "bg-warning",
        )}
        style={{ width: `${v}%` }}
      />
    </div>
  );
}

/** Tone for a "remaining allowance" meter: plenty → primary, low → warning, none → loss. */
export function remainingTone(remainingPct: number | null | undefined): "primary" | "warning" | "loss" {
  if (remainingPct === null || remainingPct === undefined) return "primary";
  if (remainingPct <= 0) return "loss";
  if (remainingPct < 25) return "warning";
  return "primary";
}
