import { cn } from "@/lib/utils";
import { formatMoney, formatPct, formatR } from "@/lib/format";

const toneClass = (v: number | null | undefined) =>
  v === null || v === undefined || v === 0 ? "text-muted-foreground" : v > 0 ? "text-profit" : "text-loss";

export function Pnl({ value, currency = "USD", className, compact, dp }: { value: number | null | undefined; currency?: string; className?: string; compact?: boolean; dp?: number }) {
  return <span className={cn("tabular", toneClass(value), className)}>{formatMoney(value, currency, { sign: true, compact, dp })}</span>;
}

export function PctValue({ value, className, sign = true }: { value: number | null | undefined; className?: string; sign?: boolean }) {
  return <span className={cn("tabular", toneClass(value), className)}>{formatPct(value, { sign })}</span>;
}

export function RValue({ value, className }: { value: number | null | undefined; className?: string }) {
  return <span className={cn("tabular", toneClass(value), className)}>{formatR(value)}</span>;
}
