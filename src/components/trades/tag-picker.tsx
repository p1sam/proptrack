"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface TagOption {
  id: string;
  name: string;
  kind: "POSITIVE" | "MISTAKE" | "NEUTRAL";
}

const KIND_ACTIVE: Record<TagOption["kind"], string> = {
  POSITIVE: "border-profit/50 bg-profit/15 text-profit",
  MISTAKE: "border-loss/50 bg-loss/15 text-loss",
  NEUTRAL: "border-primary/50 bg-primary/10 text-foreground",
};

/** Toggle chips for trade tags (buttons with aria-pressed, fully keyboard operable). */
export function TagPicker({ tags, value, onChange, disabled }: { tags: TagOption[]; value: string[]; onChange: (ids: string[]) => void; disabled?: boolean }) {
  if (!tags.length) return <p className="text-sm text-muted-foreground">No tags yet — create them in Settings.</p>;
  const selected = new Set(value);
  const groups: { kind: TagOption["kind"]; label: string }[] = [
    { kind: "POSITIVE", label: "Good" },
    { kind: "MISTAKE", label: "Mistakes" },
    { kind: "NEUTRAL", label: "Other" },
  ];
  return (
    <div className="grid gap-2">
      {groups.map((g) => {
        const list = tags.filter((t) => t.kind === g.kind);
        if (!list.length) return null;
        return (
          <div key={g.kind} role="group" aria-label={`${g.label} tags`} className="flex flex-wrap items-center gap-1.5">
            <span className="w-16 shrink-0 text-xs text-muted-foreground">{g.label}</span>
            {list.map((t) => {
              const on = selected.has(t.id);
              return (
                <button
                  key={t.id}
                  type="button"
                  aria-pressed={on}
                  disabled={disabled}
                  onClick={() => onChange(on ? value.filter((x) => x !== t.id) : [...value, t.id])}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50",
                    on ? KIND_ACTIVE[t.kind] : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  {on && <Check className="size-3" />}
                  {t.name}
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

export function TagList({ tags, className }: { tags: TagOption[]; className?: string }) {
  if (!tags.length) return null;
  return (
    <span className={cn("inline-flex flex-wrap gap-1", className)}>
      {tags.map((t) => (
        <span
          key={t.id}
          className={cn(
            "rounded border px-1.5 py-px text-[11px] whitespace-nowrap",
            t.kind === "POSITIVE" ? "border-profit/30 text-profit" : t.kind === "MISTAKE" ? "border-loss/30 text-loss" : "text-muted-foreground",
          )}
        >
          {t.name}
        </span>
      ))}
    </span>
  );
}
