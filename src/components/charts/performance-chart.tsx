"use client";

import { useMemo, useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { formatDayKey, formatMoney, formatPct, formatR, formatShortDate } from "@/lib/format";
import { AXIS_PROPS, GRID_PROPS, TooltipBox } from "./chart-tooltip";

export interface EquityPointDTO {
  at: string;
  cumPnl: number;
  balance: number;
  cumR: number;
  returnPct: number | null;
  drawdown: number;
  drawdownPct: number | null;
}
export interface DailyPointDTO {
  day: string;
  pnl: number;
  cumPnl: number;
  trades: number;
  winRate: number | null;
  rTotal: number | null;
}

type View = "equity" | "drawdown" | "daily";
type Unit = "usd" | "pct" | "r";

/**
 * Equity / drawdown / daily P&L in money, % of starting capital, or R. The page-level date
 * filter scopes the data; this component only switches the view and unit.
 */
export function PerformanceChart({
  equity,
  daily,
  currency,
  startingCapital,
  height = 280,
  defaultView = "equity",
  showBalance = false,
}: {
  equity: EquityPointDTO[];
  daily: DailyPointDTO[];
  currency: string;
  startingCapital: number;
  height?: number;
  defaultView?: View;
  showBalance?: boolean;
}) {
  const [view, setView] = useState<View>(defaultView);
  const [unit, setUnit] = useState<Unit>("usd");
  const pctAvailable = startingCapital > 0;
  const effUnit: Unit = unit === "pct" && !pctAvailable ? "usd" : unit;

  const series = useMemo(() => {
    if (view === "daily") {
      return daily.map((d) => ({
        x: d.day,
        label: formatDayKey(d.day),
        value: effUnit === "r" ? d.rTotal ?? 0 : effUnit === "pct" ? (d.pnl / startingCapital) * 100 : d.pnl,
        trades: d.trades,
      }));
    }
    return equity.map((p) => ({
      x: p.at,
      label: formatShortDate(p.at),
      value:
        view === "equity"
          ? effUnit === "r"
            ? p.cumR
            : effUnit === "pct"
              ? p.returnPct ?? 0
              : showBalance
                ? p.balance
                : p.cumPnl
          : effUnit === "pct"
            ? -(p.drawdownPct ?? 0)
            : -p.drawdown,
    }));
  }, [view, effUnit, equity, daily, startingCapital, showBalance]);

  const fmt = (v: number) => (effUnit === "r" ? formatR(v) : effUnit === "pct" ? formatPct(v, { sign: true }) : formatMoney(v, currency, { sign: view !== "equity" || !showBalance, dp: 0 }));
  const fmtFull = (v: number) => (effUnit === "r" ? formatR(v) : effUnit === "pct" ? formatPct(v, { sign: true }) : formatMoney(v, currency, { sign: view !== "equity" || !showBalance }));
  const last = series.at(-1)?.value ?? 0;
  const color = view === "drawdown" ? "var(--loss)" : last >= (showBalance && view === "equity" && effUnit === "usd" ? startingCapital : 0) ? "var(--profit)" : "var(--loss)";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ToggleGroup type="single" size="sm" variant="outline" value={view} onValueChange={(v) => v && setView(v as View)} aria-label="Chart view">
          <ToggleGroupItem value="equity">Equity</ToggleGroupItem>
          <ToggleGroupItem value="drawdown" disabled={effUnit === "r"}>Drawdown</ToggleGroupItem>
          <ToggleGroupItem value="daily">Daily P&amp;L</ToggleGroupItem>
        </ToggleGroup>
        <ToggleGroup type="single" size="sm" variant="outline" value={effUnit} onValueChange={(v) => v && setUnit(v as Unit)} aria-label="Unit">
          <ToggleGroupItem value="usd" aria-label="Money">$</ToggleGroupItem>
          <ToggleGroupItem value="pct" disabled={!pctAvailable} aria-label="Percent">%</ToggleGroupItem>
          <ToggleGroupItem value="r" disabled={view === "drawdown"} aria-label="R multiple">R</ToggleGroupItem>
        </ToggleGroup>
      </div>
      {series.length === 0 ? (
        <div className="flex items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground" style={{ height }}>
          No closed trades in this range.
        </div>
      ) : (
        <div style={{ height }} className="-ml-2">
          <ResponsiveContainer width="100%" height="100%">
            {view === "daily" ? (
              <BarChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
                <CartesianGrid {...GRID_PROPS} />
                <XAxis dataKey="label" {...AXIS_PROPS} minTickGap={24} />
                <YAxis {...AXIS_PROPS} width={64} tickFormatter={fmt} />
                <ReferenceLine y={0} stroke="var(--border)" />
                <Tooltip
                  cursor={{ fill: "var(--muted)", opacity: 0.5 }}
                  content={({ active, payload }) =>
                    active && payload?.length ? (
                      <TooltipBox
                        title={payload[0].payload.label}
                        rows={[
                          { key: "v", label: "day P&L", value: fmtFull(payload[0].payload.value) },
                          { key: "n", label: "trades", value: payload[0].payload.trades },
                        ]}
                      />
                    ) : null
                  }
                />
                <Bar dataKey="value" maxBarSize={24} radius={[4, 4, 0, 0]}>
                  {series.map((d, i) => (
                    <Cell key={i} fill={d.value >= 0 ? "var(--profit)" : "var(--loss)"} />
                  ))}
                </Bar>
              </BarChart>
            ) : (
              <AreaChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
                <defs>
                  <linearGradient id={`fill-${view}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity={0.14} />
                    <stop offset="100%" stopColor={color} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid {...GRID_PROPS} />
                <XAxis dataKey="label" {...AXIS_PROPS} minTickGap={32} />
                <YAxis {...AXIS_PROPS} width={72} tickFormatter={fmt} domain={["auto", "auto"]} />
                {view === "equity" && <ReferenceLine y={showBalance && effUnit === "usd" ? startingCapital : 0} stroke="var(--border)" />}
                <Tooltip
                  cursor={{ stroke: "var(--muted-foreground)", strokeWidth: 1 }}
                  content={({ active, payload }) =>
                    active && payload?.length ? (
                      <TooltipBox
                        title={payload[0].payload.label}
                        rows={[{ key: "v", label: view === "equity" ? (showBalance && effUnit === "usd" ? "balance" : "cumulative") : "drawdown", value: fmtFull(payload[0].payload.value), color }]}
                      />
                    ) : null
                  }
                />
                <Area type="monotone" dataKey="value" stroke={color} strokeWidth={2} fill={`url(#fill-${view})`} dot={false} activeDot={{ r: 4, stroke: "var(--card)", strokeWidth: 2 }} isAnimationActive={false} />
              </AreaChart>
            )}
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
