"use client";

import { X } from "lucide-react";
import { EMOTIONS, type Emotion } from "@/lib/calc/behavior";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { EMOTION_META, JOURNAL_SECTIONS, RATING_LABEL } from "./labels";
import type { JournalValues } from "./journal-values";

export type { JournalValues };

export function FollowedPlanField({ value, onChange, idPrefix }: { value: boolean | null; onChange: (v: boolean | null) => void; idPrefix: string }) {
  const opts: { v: boolean | null; label: string }[] = [
    { v: true, label: "Yes" },
    { v: false, label: "No" },
    { v: null, label: "Not set" },
  ];
  return (
    <fieldset className="grid gap-1.5">
      <legend className="mb-1.5 text-sm font-medium">Did you follow your plan?</legend>
      <div className="flex flex-wrap gap-1.5">
        {opts.map((o) => {
          const id = `${idPrefix}-plan-${String(o.v)}`;
          return (
            <label
              key={id}
              htmlFor={id}
              className={cn(
                "cursor-pointer rounded-md border px-3 py-1 text-sm transition-colors has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
                value === o.v ? (o.v === true ? "border-profit/50 bg-profit/15 text-profit" : o.v === false ? "border-loss/50 bg-loss/15 text-loss" : "border-primary/50 bg-primary/10") : "hover:bg-muted",
              )}
            >
              <input id={id} type="radio" name={`${idPrefix}-plan`} className="sr-only" checked={value === o.v} onChange={() => onChange(o.v)} />
              {o.label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/** 1–5 ratings for every emotion as native radio groups (arrow keys move within a row). */
export function EmotionRatings({ values, onChange, idPrefix }: { values: Record<Emotion, number | null>; onChange: (e: Emotion, v: number | null) => void; idPrefix: string }) {
  return (
    <div className="grid gap-x-6 gap-y-3 md:grid-cols-2">
      {EMOTIONS.map((e) => {
        const meta = EMOTION_META[e];
        const current = values[e];
        return (
          <fieldset key={e} className="min-w-0">
            <div className="flex items-baseline justify-between gap-2">
              <legend className="text-sm font-medium">{meta.label}</legend>
              <span className="text-xs text-muted-foreground tabular" aria-live="polite">
                {current ? `${current} · ${RATING_LABEL[current]}` : "Not rated"}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">{meta.help}</p>
            <div className="mt-1.5 flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((n) => {
                const id = `${idPrefix}-${e}-${n}`;
                return (
                  <label
                    key={n}
                    htmlFor={id}
                    title={RATING_LABEL[n]}
                    className={cn(
                      "flex size-8 cursor-pointer items-center justify-center rounded-md border text-sm tabular transition-colors has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
                      current === n ? "border-primary bg-primary text-primary-foreground" : current !== null && n < current ? "border-primary/40 bg-primary/10" : "hover:bg-muted",
                    )}
                  >
                    <input id={id} type="radio" name={`${idPrefix}-${e}`} value={n} checked={current === n} onChange={() => onChange(e, n)} className="sr-only" aria-label={`${meta.label}: ${n} of 5, ${RATING_LABEL[n]}`} />
                    {n}
                  </label>
                );
              })}
              <button
                type="button"
                onClick={() => onChange(e, null)}
                disabled={current === null}
                className="ml-1 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:invisible"
                aria-label={`Clear ${meta.label} rating`}
              >
                <X className="size-3.5" />
              </button>
            </div>
            <div className="mt-0.5 flex w-[calc(5*2rem+4*0.25rem)] justify-between text-[10px] text-muted-foreground">
              <span>Low</span>
              <span>High</span>
            </div>
          </fieldset>
        );
      })}
    </div>
  );
}

/** Before / during / after text fields + followed-plan, bound to JournalValues. */
export function JournalTextSections({ value, onChange, idPrefix, compact }: { value: JournalValues; onChange: (patch: Partial<JournalValues>) => void; idPrefix: string; compact?: boolean }) {
  return (
    <div className="grid gap-5">
      {JOURNAL_SECTIONS.map((section, si) => (
        <div key={section.title} className="grid gap-3">
          <div>
            <h3 className="text-sm font-semibold">{section.title}</h3>
            <p className="text-xs text-muted-foreground">{section.description}</p>
          </div>
          <div className={cn("grid gap-3", !compact && "md:grid-cols-2")}>
            {section.fields.map((f) => {
              const id = `${idPrefix}-${f.key}`;
              return (
                <div key={f.key} className="grid gap-1.5">
                  <Label htmlFor={id}>{f.label}</Label>
                  <Textarea id={id} rows={f.rows ?? 3} placeholder={f.placeholder} value={value[f.key]} maxLength={f.key === "emotionalState" ? 1000 : 4000} onChange={(e) => onChange({ [f.key]: e.target.value } as Partial<JournalValues>)} />
                </div>
              );
            })}
          </div>
          {si === 1 && <FollowedPlanField value={value.followedPlan} onChange={(v) => onChange({ followedPlan: v })} idPrefix={idPrefix} />}
        </div>
      ))}
    </div>
  );
}
