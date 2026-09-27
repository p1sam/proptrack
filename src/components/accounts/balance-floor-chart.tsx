"use client";

import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AXIS_PROPS, GRID_PROPS, TooltipBox } from "@/components/charts/chart-tooltip";
import { formatDateTime, formatMoney, formatShortDate } from "@/lib/format";

export interface BalanceFloorPoint {
  at: string;
  balance: number;
  floor: number | null;
  /** balance − floor, computed server-side with exact money arithmetic. */
  room: number | null;
  kind: "trade" | "withdrawal";
}

/**
 * Closed-trade balance against the max-drawdown floor over time (from AccountState.points).
 * The floor line only appears when the account has a max overall loss rule.
 */
export function BalanceFloorChart({
  points,
  startingBalance,
  targetBalance,
  currency,
  timezone,
  height = 280,
}: {
  points: BalanceFloorPoint[];
  startingBalance: number;
  targetBalance: number | null;
  currency: string;
  timezone: string;
  height?: number;
}) {
  if (points.length === 0) {
    return (
      <div className="flex items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground" style={{ height }}>
        No closed trades yet.
      </div>
    );
  }
  const first = points[0];
  const data = [
    { at: first.at, label: "Start", balance: startingBalance, floor: first.floor, room: null as number | null, kind: "start" as const },
    ...points.map((p) => ({ ...p, label: formatShortDate(p.at, timezone) })),
  ];
  const hasFloor = points.some((p) => p.floor !== null);
  const fmt = (v: number) => formatMoney(v, currency, { dp: 0 });

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded-full" style={{ background: "var(--chart-1)" }} aria-hidden /> Closed-trade balance
        </span>
        {hasFloor && (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded-full" style={{ background: "var(--loss)" }} aria-hidden /> Max drawdown floor
          </span>
        )}
        {targetBalance !== null && (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-0 w-4 border-t border-dashed" style={{ borderColor: "var(--profit)" }} aria-hidden /> Profit target
          </span>
        )}
      </div>
      <div style={{ height }} className="-ml-2">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
            <CartesianGrid {...GRID_PROPS} />
            <XAxis dataKey="label" {...AXIS_PROPS} minTickGap={32} />
            <YAxis {...AXIS_PROPS} width={76} tickFormatter={fmt} domain={["auto", "auto"]} />
            <ReferenceLine y={startingBalance} stroke="var(--border)" />
            {targetBalance !== null && <ReferenceLine y={targetBalance} stroke="var(--profit)" strokeDasharray="4 4" />}
            <Tooltip
              cursor={{ stroke: "var(--muted-foreground)", strokeWidth: 1 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload as (typeof data)[number];
                const rows: { key: string; label: string; value: string; color?: string }[] = [{ key: "b", label: "balance", value: formatMoney(p.balance, currency), color: "var(--chart-1)" }];
                if (p.floor !== null) {
                  rows.push({ key: "f", label: "floor", value: formatMoney(p.floor, currency), color: "var(--loss)" });
                  if (p.room !== null) rows.push({ key: "r", label: "room to floor", value: formatMoney(p.room, currency) });
                }
                return (
                  <TooltipBox
                    title={p.kind === "start" ? "Starting balance" : `${formatDateTime(p.at, timezone)}${p.kind === "withdrawal" ? " · payout withdrawal" : ""}`}
                    rows={rows}
                  />
                );
              }}
            />
            <Line type="monotone" dataKey="balance" stroke="var(--chart-1)" strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: "var(--card)", strokeWidth: 2 }} isAnimationActive={false} />
            {hasFloor && <Line type="stepAfter" dataKey="floor" stroke="var(--loss)" strokeWidth={2} dot={false} activeDot={false} isAnimationActive={false} connectNulls />}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
