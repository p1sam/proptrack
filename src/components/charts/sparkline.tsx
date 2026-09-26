import { formatMoney } from "@/lib/format";

/**
 * Tiny cumulative-P&L line (no axes). Colour follows the sign of the final value; the zero line
 * is drawn when the series crosses it. The accessible name states the end value and point count.
 */
export function Sparkline({ values, currency, width = 120, height = 32, className }: { values: number[]; currency: string; width?: number; height?: number; className?: string }) {
  if (values.length < 2) return <span className="text-xs text-muted-foreground">{values.length ? "1 trade" : "—"}</span>;
  const series = [0, ...values];
  const min = Math.min(...series);
  const max = Math.max(...series);
  const span = max - min || 1;
  const pad = 2;
  const x = (i: number) => pad + (i / (series.length - 1)) * (width - pad * 2);
  const y = (v: number) => pad + (1 - (v - min) / span) * (height - pad * 2);
  const d = series.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const last = series.at(-1)!;
  const color = last >= 0 ? "var(--profit)" : "var(--loss)";
  const label = `Cumulative P&L ending at ${formatMoney(last, currency, { sign: true })}`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={className} role="img" aria-label={label}>
      <title>{label}</title>
      {min < 0 && max > 0 && <line x1={pad} x2={width - pad} y1={y(0)} y2={y(0)} stroke="var(--border)" strokeWidth={1} />}
      <path d={`${d}L${x(series.length - 1).toFixed(1)},${y(Math.max(min, Math.min(0, max))).toFixed(1)}L${x(0).toFixed(1)},${y(Math.max(min, Math.min(0, max))).toFixed(1)}Z`} fill={color} opacity={0.1} />
      <path d={d} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
