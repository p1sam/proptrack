import { EMOTIONS, type Emotion } from "@/lib/calc/behavior";
import { JOURNAL_SECTIONS, type JournalTextField } from "./labels";

/** Form state for a trade journal (plain module: usable from server and client). */
export type JournalValues = { [K in JournalTextField]: string } & { [K in Emotion]: number | null } & { followedPlan: boolean | null };

const TEXT_FIELDS = JOURNAL_SECTIONS.flatMap((s) => s.fields.map((f) => f.key));

export function emptyJournal(): JournalValues {
  const v = { followedPlan: null } as JournalValues;
  for (const k of TEXT_FIELDS) v[k] = "";
  for (const e of EMOTIONS) v[e] = null;
  return v;
}

export function journalFromData(data: Partial<Record<string, string | number | boolean | null>> | null | undefined): JournalValues {
  const v = emptyJournal();
  if (!data) return v;
  for (const k of TEXT_FIELDS) v[k] = (data[k] as string | null) ?? "";
  for (const e of EMOTIONS) v[e] = (data[e] as number | null) ?? null;
  v.followedPlan = (data.followedPlan as boolean | null) ?? null;
  return v;
}

/** Shape accepted by journalSchema (empty strings become null there). */
export function journalToInput(v: JournalValues) {
  return { ...v };
}

export function journalHasContent(v: JournalValues) {
  return TEXT_FIELDS.some((k) => v[k].trim()) || EMOTIONS.some((e) => v[e] !== null) || v.followedPlan !== null;
}

