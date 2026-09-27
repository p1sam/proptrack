"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatDayKey, formatMoney, formatNumber, formatPct } from "@/lib/format";
import { AXIS_PROPS, GRID_PROPS, TooltipBox } from "@/components/charts/chart-tooltip";

const WITHIN = "var(--chart-1)";
const OVER = "var(--warning)";

function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs" aria-label="Legend">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ background: i.color }} aria-hidden />
          <span className="text-foreground">{i.label}</span>
        </li>
      ))}
    </ul>
  );
}

export interface HistogramDatum {
  label: string;
  count: number;
  overLimit: boolean;
}

/** Risk % per trade histogram. Buckets above the rule limit are drawn in the warning colour. */
export function RiskHistogram({ data, limitLabel, height = 220 }: { data: HistogramDatum[]; limitLabel: string | null; height?: number }) {
  const total = data.reduce((a, d) => a + d.count, 0);
  if (!total) return <p className="py-6 text-center text-sm text-muted-foreground">No trades with a risk %.</p>;
  const rows = data.map((d) => ({ ...d, fill: d.overLimit ? OVER : WITHIN }));
  return (
    <div className="flex flex-col gap-2">
      {limitLabel && (
        <Legend
          items={[
            { label: `Within ${limitLabel}`, color: WITHIN },
            { label: `Over ${limitLabel}`, color: OVER },
          ]}
        />
      )}
      <div style={{ height }} className="-ml-2">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 8 }} barCategoryGap="20%">
            <CartesianGrid {...GRID_PROPS} />
            <XAxis dataKey="label" {...AXIS_PROPS} interval="preserveStartEnd" minTickGap={4} />
            <YAxis {...AXIS_PROPS} width={32} allowDecimals={false} />
            <Tooltip
              cursor={{ fill: "var(--muted)", opacity: 0.5 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const r = payload[0].payload as (typeof rows)[number];
                return (
                  <TooltipBox
                    title={`Risk ${r.label}`}
                    rows={[
                      { key: "n", label: "trades", value: r.count, color: r.fill },
                      { key: "s", label: "of measured", value: formatPct((r.count / total) * 100) },
                      ...(limitLabel ? [{ key: "o", label: "vs rule", value: r.overLimit ? `Over ${limitLabel}` : `Within ${limitLabel}` }] : []),
                    ]}
                  />
                );
              }}
            />
            <Bar dataKey="count" maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false}>
              {rows.map((d) => (
                <Cell key={d.label} fill={d.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export interface DailyRiskDatum {
  day: string;
  trades: number;
  totalRisk: number;
  totalRiskPct: number | null;
  withoutRisk: number;
}

/** Sum of initial risk of the trades opened each trading day. */
export function DailyRiskChart({ data, currency, height = 220 }: { data: DailyRiskDatum[]; currency: string; height?: number }) {
  if (!data.length) return <p className="py-6 text-center text-sm text-muted-foreground">No trading days.</p>;
  return (
    <div style={{ height }} className="-ml-2">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }} barCategoryGap="15%">
          <CartesianGrid {...GRID_PROPS} />
          <XAxis dataKey="day" {...AXIS_PROPS} interval="preserveStartEnd" minTickGap={24} tickFormatter={(d: string) => formatDayKey(d, { month: "short", day: "numeric" })} />
          <YAxis {...AXIS_PROPS} width={64} tickFormatter={(v: number) => formatMoney(v, currency, { dp: 0 })} />
          <Tooltip
            cursor={{ fill: "var(--muted)", opacity: 0.5 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const r = payload[0].payload as DailyRiskDatum;
              return (
                <TooltipBox
                  title={formatDayKey(r.day, { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
                  rows={[
                    { key: "r", label: "risked", value: formatMoney(r.totalRisk, currency), color: WITHIN },
                    { key: "p", label: "of balance (sum)", value: formatPct(r.totalRiskPct) },
                    { key: "t", label: r.trades === 1 ? "trade" : "trades", value: formatNumber(r.trades, 0) },
                    ...(r.withoutRisk ? [{ key: "w", label: "without a stop", value: formatNumber(r.withoutRisk, 0) }] : []),
                  ]}
                />
              );
            }}
          />
          <Bar dataKey="totalRisk" fill={WITHIN} maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
