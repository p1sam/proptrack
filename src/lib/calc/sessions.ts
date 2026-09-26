import { inMinuteWindow, minuteOfDay } from "./time";

export interface SessionDef {
  id: string;
  name: string;
  timezone: string;
  startMinute: number;
  endMinute: number;
  priority: number;
  isActive?: boolean;
}

/**
 * Assign a trade to the first active session (lowest priority number first) whose window
 * contains the open time. Overlapping windows are resolved by priority, which lets an
 * "London/NY overlap" session sit above London and New York.
 */
export function assignSession(openedAt: Date, sessions: SessionDef[]): SessionDef | null {
  const ordered = sessions.filter((s) => s.isActive !== false).sort((a, b) => a.priority - b.priority);
  for (const s of ordered) {
    if (inMinuteWindow(minuteOfDay(openedAt, s.timezone), s.startMinute, s.endMinute)) return s;
  }
  return null;
}

/** Default sessions, defined in New York time so DST shifts are handled by the timezone. */
export const DEFAULT_SESSIONS: Omit<SessionDef, "id">[] = [
  { name: "London/NY Overlap", timezone: "America/New_York", startMinute: 8 * 60, endMinute: 12 * 60, priority: 10 },
  { name: "London", timezone: "America/New_York", startMinute: 3 * 60, endMinute: 12 * 60, priority: 20 },
  { name: "New York", timezone: "America/New_York", startMinute: 8 * 60, endMinute: 17 * 60, priority: 30 },
  { name: "Asian", timezone: "America/New_York", startMinute: 19 * 60, endMinute: 3 * 60, priority: 40 },
];
