"use client";

/** Shared tooltip chrome: value first (strong), series label second, keyed by a short line. */
export function TooltipBox({ title, rows }: { title?: React.ReactNode; rows: { key: string; label: string; value: React.ReactNode; color?: string }[] }) {
  return (
    <div className="min-w-36 rounded-md border bg-popover px-2.5 py-2 text-xs shadow-md">
      {title && <div className="mb-1 text-muted-foreground">{title}</div>}
      <div className="flex flex-col gap-1">
        {rows.map((r) => (
          <div key={r.key} className="flex items-center gap-2">
            {r.color && <span className="h-0.5 w-3 rounded-full" style={{ background: r.color }} />}
            <span className="font-semibold tabular text-foreground">{r.value}</span>
            <span className="text-muted-foreground">{r.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export const AXIS_PROPS = {
  tick: { fill: "var(--muted-foreground)", fontSize: 11 },
  axisLine: false,
  tickLine: false,
} as const;

export const GRID_PROPS = { stroke: "var(--chart-grid)", vertical: false } as const;
