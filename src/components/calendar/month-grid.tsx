import Link from "next/link";
import { cn } from "@/lib/utils";
import { formatMoney, formatPct, formatR } from "@/lib/format";

export interface CalendarDay {
  day: string;
  pnl: number;
  trades: number;
  winRate: number | null;
  rTotal: number | null;
}

/**
 * Month grid (Mon–Sun) with profit/loss intensity. Intensity scales with |P&L| relative to the
 * month's largest day; the signed amount is always printed, so colour is never the only cue.
 */
export function MonthGrid({
  month,
  days,
  currency,
  hrefFor,
  selected,
  compact = false,
  today,
}: {
  month: string; // YYYY-MM
  days: CalendarDay[];
  currency: string;
  hrefFor?: (day: string) => string;
  selected?: string | null;
  compact?: boolean;
  today?: string;
}) {
  const [y, m] = month.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lead = (first.getUTCDay() + 6) % 7; // Monday-first
  const byDay = new Map(days.map((d) => [d.day, d]));
  const maxAbs = Math.max(1, ...days.map((d) => Math.abs(d.pnl)));
  const cells: (string | null)[] = [...Array(lead).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`)];
  while (cells.length % 7) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  return (
    <div className="w-full">
      <div className="grid grid-cols-7 gap-1 pb-1 text-center text-[11px] text-muted-foreground">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div key={d}>{compact ? d[0] : d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {weeks.flat().map((key, i) => {
          if (!key) return <div key={i} className={compact ? "h-10" : "min-h-20"} />;
          const d = byDay.get(key);
          const intensity = d ? 0.12 + 0.5 * (Math.abs(d.pnl) / maxAbs) : 0;
          const bg = d && d.pnl !== 0 ? `color-mix(in oklch, ${d.pnl > 0 ? "var(--profit)" : "var(--loss)"} ${Math.round(intensity * 100)}%, transparent)` : undefined;
          const content = (
            <>
              <div className={cn("text-[11px] text-muted-foreground", key === today && "font-semibold text-foreground")}>{Number(key.slice(8))}</div>
              {d && (
                <div className="mt-auto text-right">
                  <div className={cn("font-medium tabular", compact ? "text-[10px]" : "text-xs")}>{formatMoney(d.pnl, currency, { sign: true, dp: 0, compact: true })}</div>
                  {!compact && (
                    <div className="text-[10px] text-muted-foreground tabular">
                      {d.trades} trade{d.trades === 1 ? "" : "s"} · {formatPct(d.winRate, { dp: 0 })}
                      {d.rTotal !== null && <> · {formatR(d.rTotal, 1)}</>}
                    </div>
                  )}
                </div>
              )}
            </>
          );
          const cls = cn(
            "flex flex-col rounded-md border border-transparent bg-muted/30 p-1.5 text-left transition-colors",
            compact ? "h-10" : "min-h-20",
            d && "hover:border-foreground/20",
            selected === key && "border-primary ring-1 ring-primary",
          );
          return d && hrefFor ? (
            <Link key={key} href={hrefFor(key)} scroll={false} className={cls} style={{ background: bg }} aria-label={`${key}: ${formatMoney(d.pnl, currency, { sign: true })}, ${d.trades} trades`}>
              {content}
            </Link>
          ) : (
            <div key={key} className={cls} style={{ background: bg }}>
              {content}
            </div>
          );
        })}
      </div>
    </div>
  );
}
