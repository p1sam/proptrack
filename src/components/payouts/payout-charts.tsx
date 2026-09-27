"use client";

import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AXIS_PROPS, GRID_PROPS, TooltipBox } from "@/components/charts/chart-tooltip";
import { formatMoney, formatMonthKey } from "@/lib/format";

export interface PayoutMonthDTO {
  month: string;
  received: number;
  count: number;
  cumulative: number;
}

function Empty({ height }: { height: number }) {
  return (
    <div className="flex items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground" style={{ height }}>
      No paid payouts yet.
    </div>
  );
}

/** Cash received per month (by payment date). */
export function PayoutMonthlyChart({ data, currency, height = 220 }: { data: PayoutMonthDTO[]; currency: string; height?: number }) {
  if (!data.length) return <Empty height={height} />;
  const rows = data.map((d) => ({ ...d, label: formatMonthKey(d.month) }));
  return (
    <div style={{ height }} className="-ml-2">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
          <CartesianGrid {...GRID_PROPS} />
          <XAxis dataKey="label" {...AXIS_PROPS} minTickGap={16} />
          <YAxis {...AXIS_PROPS} width={64} tickFormatter={(v: number) => formatMoney(v, currency, { dp: 0, compact: true })} />
          <Tooltip
            cursor={{ fill: "var(--muted)", opacity: 0.5 }}
            content={({ active, payload }) =>
              active && payload?.length ? (
                <TooltipBox
                  title={payload[0].payload.label}
                  rows={[
                    { key: "r", label: "received", value: formatMoney(payload[0].payload.received, currency), color: "var(--profit)" },
                    { key: "n", label: payload[0].payload.count === 1 ? "payout" : "payouts", value: payload[0].payload.count },
                  ]}
                />
              ) : null
            }
          />
          <Bar dataKey="received" fill="var(--profit)" maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Running total of cash received. */
export function PayoutCumulativeChart({ data, currency, height = 220 }: { data: PayoutMonthDTO[]; currency: string; height?: number }) {
  if (!data.length) return <Empty height={height} />;
  const rows = data.map((d) => ({ ...d, label: formatMonthKey(d.month) }));
  return (
    <div style={{ height }} className="-ml-2">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
          <CartesianGrid {...GRID_PROPS} />
          <XAxis dataKey="label" {...AXIS_PROPS} minTickGap={16} />
          <YAxis {...AXIS_PROPS} width={64} tickFormatter={(v: number) => formatMoney(v, currency, { dp: 0, compact: true })} />
          <Tooltip
            cursor={{ stroke: "var(--muted-foreground)", strokeWidth: 1 }}
            content={({ active, payload }) =>
              active && payload?.length ? (
                <TooltipBox
                  title={payload[0].payload.label}
                  rows={[
                    { key: "c", label: "received to date", value: formatMoney(payload[0].payload.cumulative, currency), color: "var(--chart-1)" },
                    { key: "m", label: "this month", value: formatMoney(payload[0].payload.received, currency) },
                  ]}
                />
              ) : null
            }
          />
          <Line type="monotone" dataKey="cumulative" stroke="var(--chart-1)" strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: "var(--card)", strokeWidth: 2 }} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
