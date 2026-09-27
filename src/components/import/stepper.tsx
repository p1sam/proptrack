"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface StepDef {
  id: string;
  label: string;
}

/** Horizontal progress stepper. Completed steps are buttons so the user can go back. */
export function Stepper({ steps, current, reached, onSelect }: { steps: StepDef[]; current: number; reached: number; onSelect: (index: number) => void }) {
  return (
    <nav aria-label="Import progress">
      <ol className="flex gap-1 overflow-x-auto pb-1 sm:gap-2">
        {steps.map((s, i) => {
          const done = i < current;
          const active = i === current;
          const enabled = i <= reached && !active;
          return (
            <li key={s.id} className="flex min-w-0 flex-1 items-center gap-1 sm:gap-2">
              <button
                type="button"
                onClick={() => enabled && onSelect(i)}
                disabled={!enabled}
                aria-current={active ? "step" : undefined}
                className={cn(
                  "flex min-w-0 items-center gap-2 rounded-md px-1.5 py-1 text-left text-xs outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:text-sm",
                  enabled && "hover:bg-muted",
                  !enabled && !active && "cursor-default",
                )}
              >
                <span
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-medium tabular",
                    active && "border-primary bg-primary text-primary-foreground",
                    done && "border-primary text-primary",
                    !active && !done && "text-muted-foreground",
                  )}
                  aria-hidden
                >
                  {done ? <Check className="size-3.5" /> : i + 1}
                </span>
                <span className={cn("truncate", active ? "font-medium" : "text-muted-foreground", "hidden sm:inline")}>{s.label}</span>
                <span className="sr-only">
                  {`Step ${i + 1} of ${steps.length}: ${s.label}`}
                  {done ? " (completed)" : active ? " (current)" : ""}
                </span>
              </button>
              {i < steps.length - 1 && <span className="h-px min-w-2 flex-1 bg-border" aria-hidden />}
            </li>
          );
        })}
      </ol>
      <p className="mt-1 text-xs text-muted-foreground sm:hidden">
        Step {current + 1} of {steps.length}: {steps[current]?.label}
      </p>
    </nav>
  );
}
