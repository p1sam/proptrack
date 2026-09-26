"use client";

import { useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { formatDayKey, formatMoney, formatR } from "@/lib/format";
import { AXIS_PROPS, GRID_PROPS, TooltipBox } from "./chart-tooltip";

export interface CompareSeries {
  key: string;
  label: string;
}
export interface CompareRow {
  x: string; // YYYY-MM-DD
  values: Record<string, number>;
}

/** Fixed categorical order — colour follows the series' position in the selection, never its rank. */
export const COMPARE_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)"] as const;

/** Overlaid cumulative curves (money or R) on one axis, one colour per series, with a legend. */
export function CompareChart({ series, money, r, currency, height = 300 }: { series: CompareSeries[]; money: CompareRow[]; r: CompareRow[]; currency: string; height?: number }) {
  const [unit, setUnit] = useState<"usd" | "r">("usd");
  const rows = (unit === "r" ? r : money).map((row) => ({ x: row.x, label: formatDayKey(row.x, { month: "short", day: "numeric", year: "2-digit" }), ...row.values }));
  const fmt = (v: number, full = false) => (unit === "r" ? formatR(v, full ? 2 : 1) : formatMoney(v, currency, { sign: true, dp: full ? 2 : 0 }));
  const shown = series.slice(0, COMPARE_COLORS.length);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs" aria-label="Legend">
          {shown.map((s, i) => (
            <li key={s.key} className="flex items-center gap-1.5">
              <span className="h-0.5 w-4 rounded-full" style={{ background: COMPARE_COLORS[i] }} aria-hidden />
              <span className="text-foreground">{s.label}</span>
            </li>
          ))}
        </ul>
        <ToggleGroup type="single" size="sm" variant="outline" value={unit} onValueChange={(v) => v && setUnit(v as "usd" | "r")} aria-label="Unit">
          <ToggleGroupItem value="usd" aria-label="Money">$</ToggleGroupItem>
          <ToggleGroupItem value="r" aria-label="R multiple">R</ToggleGroupItem>
        </ToggleGroup>
      </div>
      {rows.length === 0 ? (
        <div className="flex items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground" style={{ height }}>
          No closed trades for the selected strategies.
        </div>
      ) : (
        <div style={{ height }} className="-ml-2">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
              <CartesianGrid {...GRID_PROPS} />
              <XAxis dataKey="label" {...AXIS_PROPS} minTickGap={32} />
              <YAxis {...AXIS_PROPS} width={72} tickFormatter={(v: number) => fmt(v)} domain={["auto", "auto"]} />
              <ReferenceLine y={0} stroke="var(--border)" />
              <Tooltip
                cursor={{ stroke: "var(--muted-foreground)", strokeWidth: 1 }}
                content={({ active, payload }) =>
                  active && payload?.length ? (
                    <TooltipBox
                      title={formatDayKey((payload[0].payload as { x: string }).x)}
                      rows={shown.map((s, i) => ({ key: s.key, label: s.label, value: fmt(Number((payload[0].payload as Record<string, number>)[s.key] ?? 0), true), color: COMPARE_COLORS[i] }))}
                    />
                  ) : null
                }
              />
              {shown.map((s, i) => (
                <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={COMPARE_COLORS[i]} strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: "var(--card)", strokeWidth: 2 }} isAnimationActive={false} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
