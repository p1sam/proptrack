"use client";

import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatMoney, formatNumber, formatPct, formatR } from "@/lib/format";
import { AXIS_PROPS, GRID_PROPS, TooltipBox } from "./chart-tooltip";

export type ValueKind = "money" | "r" | "count" | "pct";
export type Tone = "profit" | "loss" | "neutral";

export interface ColumnDatum {
  key: string;
  label: string;
  value: number;
  /** Colour job: profit/loss for signed values, neutral (single hue) for magnitudes such as counts. */
  tone?: Tone;
  /** Extra tooltip rows, already formatted on the server. */
  details?: { label: string; value: string }[];
}

const TONE_FILL: Record<Tone, string> = { profit: "var(--profit)", loss: "var(--loss)", neutral: "var(--chart-1)" };

export function formatValue(v: number, kind: ValueKind, currency: string, full = false): string {
  if (kind === "money") return formatMoney(v, currency, { sign: true, dp: full ? 2 : 0 });
  if (kind === "r") return formatR(v, full ? 2 : 1);
  if (kind === "pct") return formatPct(v, { sign: true });
  return formatNumber(v, 0);
}

/**
 * Vertical columns for a category or time axis (months, weekdays, hours, histogram buckets).
 * Bars are ≤24px with rounded data ends; signed values are coloured by sign and always printed
 * with a sign in the tooltip.
 */
export function ColumnChart({
  data,
  kind,
  currency = "USD",
  height = 240,
  valueLabel,
  emptyText = "No data.",
}: {
  data: ColumnDatum[];
  kind: ValueKind;
  currency?: string;
  height?: number;
  valueLabel: string;
  emptyText?: string;
}) {
  if (!data.length) return <p className="py-6 text-center text-sm text-muted-foreground">{emptyText}</p>;
  const signed = kind !== "count";
  const rows = data.map((d) => ({ ...d, fill: TONE_FILL[d.tone ?? (!signed ? "neutral" : d.value >= 0 ? "profit" : "loss")] }));
  return (
    <div style={{ height }} className="-ml-2">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 8 }} barCategoryGap="20%">
          <CartesianGrid {...GRID_PROPS} />
          <XAxis dataKey="label" {...AXIS_PROPS} interval="preserveStartEnd" minTickGap={8} />
          <YAxis {...AXIS_PROPS} width={kind === "money" ? 64 : 40} tickFormatter={(v: number) => formatValue(v, kind, currency)} allowDecimals={kind !== "count"} />
          {signed && <ReferenceLine y={0} stroke="var(--border)" />}
          <Tooltip
            cursor={{ fill: "var(--muted)", opacity: 0.5 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const r = payload[0].payload as (typeof rows)[number];
              return (
                <TooltipBox
                  title={r.label}
                  rows={[
                    { key: "v", label: valueLabel, value: formatValue(r.value, kind, currency, true), color: r.fill },
                    ...(r.details ?? []).map((d, i) => ({ key: `d${i}`, label: d.label, value: d.value })),
                  ]}
                />
              );
            }}
          />
          {/* Recharts anchors y at the data end, so [4,4,0,0] rounds the data end of negative bars too. */}
          <Bar dataKey="value" maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false}>
            {rows.map((d) => (
              <Cell key={d.key} fill={d.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
