import Link from "next/link";
import { cn } from "@/lib/utils";
import { formatMoney, formatPct, formatR } from "@/lib/format";

export interface WeekTotalCell {
  pnl: number;
  trades: number;
  tradingDays: number;
}

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
  large = false,
  today,
  weekTotals,
}: {
  month: string; // YYYY-MM
  days: CalendarDay[];
  currency: string;
  hrefFor?: (day: string) => string;
  selected?: string | null;
  compact?: boolean;
  /** Taller cells with a larger P&L figure (full-page calendar). Ignored when compact. */
  large?: boolean;
  today?: string;
  /** Optional totals per grid row (Monday-first weeks), rendered as an extra column. */
  weekTotals?: WeekTotalCell[];
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
  const big = large && !compact;
  const cellH = compact ? "h-10" : big ? "min-h-24" : "min-h-20";
  const withWeeks = !!weekTotals && !compact;
  const cols = withWeeks ? "grid-cols-[repeat(7,minmax(0,1fr))_minmax(0,0.9fr)]" : "grid-cols-7";
  const flat: (string | null | { week: number })[] = withWeeks ? weeks.flatMap((w, i) => [...w, { week: i }]) : weeks.flat();

  return (
    <div className="w-full">
      <div className={cn("grid gap-1 pb-1 text-center text-[11px] text-muted-foreground", cols)}>
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div key={d}>{compact ? d[0] : d}</div>
        ))}
        {withWeeks && <div>Week</div>}
      </div>
      <div className={cn("grid gap-1", cols)}>
        {flat.map((key, i) => {
          if (key && typeof key === "object") {
            const w = weekTotals![key.week];
            return (
              <div key={`w${key.week}`} className={cn("flex flex-col rounded-md border bg-card p-1.5 text-right", cellH)}>
                <div className="text-[11px] text-muted-foreground">W{key.week + 1}</div>
                {w && w.tradingDays > 0 ? (
                  <div className="mt-auto">
                    <div className={cn("font-semibold tabular", big ? "text-sm" : "text-xs", w.pnl > 0 ? "text-profit" : w.pnl < 0 ? "text-loss" : "text-muted-foreground")}>{formatMoney(w.pnl, currency, { sign: true, dp: 0, compact: true })}</div>
                    <div className="text-[10px] text-muted-foreground tabular">
                      {w.trades} trade{w.trades === 1 ? "" : "s"} · {w.tradingDays}d
                    </div>
                  </div>
                ) : (
                  <div className="mt-auto text-[10px] text-muted-foreground">—</div>
                )}
              </div>
            );
          }
          if (!key) return <div key={i} className={cellH} />;
          const d = byDay.get(key);
          const intensity = d ? 0.12 + 0.5 * (Math.abs(d.pnl) / maxAbs) : 0;
          const bg = d && d.pnl !== 0 ? `color-mix(in oklch, ${d.pnl > 0 ? "var(--profit)" : "var(--loss)"} ${Math.round(intensity * 100)}%, transparent)` : undefined;
          const content = (
            <>
              <div className={cn("text-[11px] text-muted-foreground", key === today && "font-semibold text-foreground")}>{Number(key.slice(8))}</div>
              {d && (
                <div className="mt-auto text-right">
                  <div className={cn("font-medium tabular", compact ? "text-[10px]" : big ? "text-sm" : "text-xs")}>{formatMoney(d.pnl, currency, { sign: true, dp: 0, compact: true })}</div>
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
            cellH,
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
