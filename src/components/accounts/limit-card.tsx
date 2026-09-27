import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { Meter, remainingTone } from "@/components/app/meter";
import { cn } from "@/lib/utils";

export type Tone = "primary" | "profit" | "loss" | "warning";

/** Tone for a remaining allowance plus an icon + word so colour is never the only signal. */
export function allowanceStatus(remainingPct: number | null | undefined, remaining: number | null | undefined) {
  const tone = remaining !== null && remaining !== undefined && remaining <= 0 ? "loss" : remainingTone(remainingPct);
  const word = tone === "loss" ? "Limit hit" : tone === "warning" ? "Low" : "OK";
  return { tone, word } as const;
}

export function ToneIcon({ tone, className }: { tone: Tone; className?: string }) {
  if (tone === "loss") return <XCircle className={cn("size-3.5 shrink-0 text-loss", className)} aria-hidden />;
  if (tone === "warning") return <AlertTriangle className={cn("size-3.5 shrink-0 text-warning", className)} aria-hidden />;
  return <CheckCircle2 className={cn("size-3.5 shrink-0 text-profit", className)} aria-hidden />;
}

/** A metric card with a meter: title, headline value, meter and two detail lines. */
export function LimitCard({
  label,
  value,
  meter,
  tone = "primary",
  meterLabel,
  lines,
  status,
  className,
}: {
  label: string;
  value: React.ReactNode;
  meter?: number | null;
  tone?: Tone;
  meterLabel?: string;
  lines?: React.ReactNode[];
  status?: { tone: Tone; word: string };
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-2 rounded-lg border bg-card px-4 py-3", className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-xs font-medium text-muted-foreground">{label}</span>
        {status && (
          <span className={cn("inline-flex items-center gap-1 text-[11px] font-medium", status.tone === "loss" ? "text-loss" : status.tone === "warning" ? "text-warning" : "text-muted-foreground")}>
            <ToneIcon tone={status.tone} /> {status.word}
          </span>
        )}
      </div>
      <div className="text-xl font-semibold tabular tracking-tight">{value}</div>
      {meter !== undefined && <Meter value={meter} tone={tone} label={meterLabel ?? label} />}
      {lines?.length ? (
        <div className="flex flex-col gap-0.5 text-xs text-muted-foreground tabular">
          {lines.map((l, i) => (
            <div key={i}>{l}</div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
