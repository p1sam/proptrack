import { formatMinute } from "@/lib/calc/time";
import { shiftMinute, windowSegments, winnerTimeline, type TimelineSession } from "./logic";

export interface TimelineRow extends TimelineSession {
  color: string | null;
}

export function sessionColor(s: { color: string | null }, index: number) {
  return s.color ?? `var(--chart-${(index % 5) + 1})`;
}

const pct = (m: number) => `${(m / 1440) * 100}%`;
const HOURS = [0, 3, 6, 9, 12, 15, 18, 21, 24];

/**
 * 24-hour bars for each session plus the resulting assignment ("first match wins"), drawn in
 * `displayTz` using today's UTC offsets.
 */
export function SessionTimeline({ sessions, displayTz }: { sessions: TimelineRow[]; displayTz: string }) {
  const now = new Date();
  const colorOf = new Map(sessions.map((s, i) => [s.id, sessionColor(s, i)]));
  const nameOf = new Map(sessions.map((s) => [s.id, s.name]));
  const winners = winnerTimeline(sessions, displayTz, now);

  return (
    <figure className="flex flex-col gap-2" aria-label={`Session timeline in ${displayTz}`}>
      <div className="flex flex-col gap-1.5">
        {sessions.map((s) => {
          const start = shiftMinute(s.startMinute, s.timezone, displayTz, now);
          const end = shiftMinute(s.endMinute, s.timezone, displayTz, now);
          return (
            <div key={s.id} className="grid grid-cols-[7rem_1fr] items-center gap-2 sm:grid-cols-[9rem_1fr]">
              <span className={`truncate text-xs ${s.isActive ? "" : "text-muted-foreground line-through"}`}>{s.name}</span>
              <div className="relative h-4 rounded-sm bg-muted" role="img" aria-label={`${s.name}: ${formatMinute(start)}–${formatMinute(end)}${s.isActive ? "" : " (inactive)"}`}>
                {windowSegments(start, end).map((seg) => (
                  <span
                    key={seg.start}
                    className="absolute inset-y-0 rounded-sm"
                    style={{ left: pct(seg.start), width: pct(seg.end - seg.start), backgroundColor: colorOf.get(s.id), opacity: s.isActive ? 0.85 : 0.3 }}
                  />
                ))}
              </div>
            </div>
          );
        })}
        <div className="grid grid-cols-[7rem_1fr] items-center gap-2 border-t pt-1.5 sm:grid-cols-[9rem_1fr]">
          <span className="truncate text-xs font-medium">Assigned</span>
          <div className="relative h-5 overflow-hidden rounded-sm bg-muted">
            {winners.map((w) =>
              w.id ? (
                <span
                  key={w.start}
                  className="absolute inset-y-0"
                  title={`${formatMinute(w.start)}–${formatMinute(w.end)}: ${nameOf.get(w.id)}`}
                  style={{ left: pct(w.start), width: pct(w.end - w.start), backgroundColor: colorOf.get(w.id) }}
                />
              ) : null,
            )}
          </div>
        </div>
        <div className="grid grid-cols-[7rem_1fr] gap-2 sm:grid-cols-[9rem_1fr]" aria-hidden>
          <span />
          <div className="relative h-4 text-[10px] text-muted-foreground tabular">
            {HOURS.map((h) => (
              <span key={h} className="absolute -translate-x-1/2 first:translate-x-0 last:-translate-x-full" style={{ left: pct(h * 60) }}>
                {String(h).padStart(2, "0")}
              </span>
            ))}
          </div>
        </div>
      </div>
      <figcaption className="text-xs text-muted-foreground">
        Shown in {displayTz.replace(/_/g, " ")} at today&apos;s UTC offsets. The &ldquo;Assigned&rdquo; row is the session a trade opened at that time is tagged with.
      </figcaption>
      <ul className="sr-only">
        {winners.map((w) => (
          <li key={w.start}>
            {formatMinute(w.start)}–{formatMinute(w.end)}: {w.id ? nameOf.get(w.id) : "no session"}
          </li>
        ))}
      </ul>
    </figure>
  );
}
