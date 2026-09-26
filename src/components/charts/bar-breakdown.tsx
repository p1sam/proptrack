"use client";

import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatMoney, formatPct, formatR } from "@/lib/format";
import { AXIS_PROPS, TooltipBox } from "./chart-tooltip";

export interface BreakdownRow {
  key: string;
  label: string;
  netPnl: number;
  trades: number;
  winRate: number | null;
  averageR: number | null;
}

/** Horizontal P&L bars per group, signed and coloured by direction. */
export function BarBreakdown({ rows, currency, metric = "pnl", height }: { rows: BreakdownRow[]; currency: string; metric?: "pnl" | "r"; height?: number }) {
  const data = rows.map((r) => ({ ...r, value: metric === "r" ? r.averageR ?? 0 : r.netPnl }));
  const fmt = (v: number) => (metric === "r" ? formatR(v) : formatMoney(v, currency, { sign: true, dp: 0 }));
  if (!data.length) return <p className="py-6 text-center text-sm text-muted-foreground">No data.</p>;
  return (
    <div style={{ height: height ?? Math.max(120, data.length * 34 + 30) }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 4 }} barCategoryGap={6}>
          <CartesianGrid stroke="var(--chart-grid)" horizontal={false} />
          <XAxis type="number" {...AXIS_PROPS} tickFormatter={fmt} />
          <YAxis type="category" dataKey="label" {...AXIS_PROPS} width={120} tick={{ fill: "var(--foreground)", fontSize: 12 }} />
          <ReferenceLine x={0} stroke="var(--border)" />
          <Tooltip
            cursor={{ fill: "var(--muted)", opacity: 0.4 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const r = payload[0].payload as (typeof data)[number];
              return (
                <TooltipBox
                  title={r.label}
                  rows={[
                    { key: "p", label: "net P&L", value: formatMoney(r.netPnl, currency, { sign: true }) },
                    { key: "t", label: "trades", value: r.trades },
                    { key: "w", label: "win rate", value: formatPct(r.winRate) },
                    { key: "r", label: "avg R", value: formatR(r.averageR) },
                  ]}
                />
              );
            }}
          />
          <Bar dataKey="value" maxBarSize={20} radius={4}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.value >= 0 ? "var(--profit)" : "var(--loss)"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
