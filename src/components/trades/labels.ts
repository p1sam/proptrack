import type { Emotion } from "@/lib/calc/behavior";

export const GRADES = ["A_PLUS", "A", "B", "C", "D", "F"] as const;
export type Grade = (typeof GRADES)[number];
export const GRADE_LABEL: Record<Grade, string> = { A_PLUS: "A+", A: "A", B: "B", C: "C", D: "D", F: "F" };
export const gradeLabel = (g: string | null | undefined) => (g ? (GRADE_LABEL[g as Grade] ?? g) : "—");

export const PHASES = ["BEFORE", "DURING", "AFTER"] as const;
export type Phase = (typeof PHASES)[number];
export const PHASE_LABEL: Record<Phase, string> = { BEFORE: "Before", DURING: "During", AFTER: "After" };

/** Labels and anchors for the 1–5 psychology ratings. Higher always means "more of it". */
export const EMOTION_META: Record<Emotion, { label: string; help: string; positive: boolean }> = {
  confidence: { label: "Confidence", help: "How sure you were in the trade idea", positive: true },
  stress: { label: "Stress", help: "Tension or pressure while trading", positive: false },
  fear: { label: "Fear", help: "Worry about losing or being wrong", positive: false },
  greed: { label: "Greed", help: "Wanting more than the plan offered", positive: false },
  patience: { label: "Patience", help: "Waiting for your setup and exits", positive: true },
  fomo: { label: "FOMO", help: "Fear of missing out on the move", positive: false },
  revenge: { label: "Revenge", help: "Urge to win back a previous loss", positive: false },
  boredom: { label: "Boredom", help: "Trading for something to do", positive: false },
  discipline: { label: "Discipline", help: "Sticking to your rules", positive: true },
};

export const RATING_LABEL = ["", "Very low", "Low", "Moderate", "High", "Very high"];

export type JournalTextField =
  | "reason"
  | "thesis"
  | "setupExplanation"
  | "expectedOutcome"
  | "riskJustification"
  | "whatHappened"
  | "changes"
  | "wentWell"
  | "wentWrong"
  | "lesson"
  | "emotionalState"
  | "mistakes";

export const JOURNAL_SECTIONS: { title: string; description: string; fields: { key: JournalTextField; label: string; placeholder?: string; rows?: number }[] }[] = [
  {
    title: "Before the trade",
    description: "The plan, written as if before entry.",
    fields: [
      { key: "reason", label: "Why I took it", placeholder: "What triggered the entry?" },
      { key: "thesis", label: "Thesis", placeholder: "What did you expect the market to do, and why?" },
      { key: "setupExplanation", label: "Setup", placeholder: "Describe the setup and its confluences" },
      { key: "expectedOutcome", label: "Expected outcome", placeholder: "Target, invalidation, timeframe" },
      { key: "riskJustification", label: "Risk justification", placeholder: "Why this size and this stop?" },
    ],
  },
  {
    title: "During the trade",
    description: "What actually happened while in the position.",
    fields: [
      { key: "whatHappened", label: "What happened", placeholder: "How price moved, how you managed it" },
      { key: "changes", label: "Changes to the plan", placeholder: "Moved stop, partials, early exit…" },
    ],
  },
  {
    title: "After the trade",
    description: "Review with hindsight.",
    fields: [
      { key: "wentWell", label: "What went well" },
      { key: "wentWrong", label: "What went wrong" },
      { key: "lesson", label: "Lesson", placeholder: "One thing to repeat or change next time" },
      { key: "mistakes", label: "Mistakes", placeholder: "Rule breaks, execution errors" },
      { key: "emotionalState", label: "Emotional state", placeholder: "In a few words", rows: 2 },
    ],
  },
];
