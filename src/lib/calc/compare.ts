/**
 * Helpers for comparing several cumulative series (e.g. strategies) on one shared x-axis.
 * They only re-index values produced elsewhere in the calc layer — no money arithmetic happens here.
 */

export interface XPoint {
  x: string;
  value: number;
}

/** Keep the last point for each bucket (e.g. the last cumulative value of each day). Input order is preserved. */
export function lastPerBucket<T>(points: T[], bucket: (p: T) => string, value: (p: T) => number): XPoint[] {
  const map = new Map<string, number>();
  for (const p of points) map.set(bucket(p), value(p));
  return [...map.entries()].map(([x, v]) => ({ x, value: v }));
}

export interface AlignedRow {
  x: string;
  values: Record<string, number>;
}

/**
 * Merge cumulative series onto the sorted union of their x values. A series is 0 before its first
 * point (nothing accumulated yet) and carries its last value forward across gaps.
 */
export function alignCumulative(series: { key: string; points: XPoint[] }[]): AlignedRow[] {
  const xs = [...new Set(series.flatMap((s) => s.points.map((p) => p.x)))].sort();
  const lookups = series.map((s) => ({ key: s.key, map: new Map(s.points.map((p) => [p.x, p.value])) }));
  const last: Record<string, number> = Object.fromEntries(series.map((s) => [s.key, 0]));
  return xs.map((x) => {
    for (const l of lookups) {
      const v = l.map.get(x);
      if (v !== undefined) last[l.key] = v;
    }
    return { x, values: { ...last } };
  });
}

/** Evenly thin a series to at most `max` points, always keeping the first and last. */
export function downsample<T>(points: T[], max: number): T[] {
  if (max < 2 || points.length <= max) return points;
  const out: T[] = [];
  const step = (points.length - 1) / (max - 1);
  for (let i = 0; i < max; i++) out.push(points[Math.round(i * step)]);
  return out;
}
