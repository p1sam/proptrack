"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { RANGE_PRESETS, type RangePreset } from "@/lib/filters";
import { cn } from "@/lib/utils";

const LABELS: Record<RangePreset, string> = { today: "Today", "7d": "7D", "30d": "30D", "90d": "90D", "6m": "6M", "1y": "1Y", all: "All" };

/** Date range presets bound to the `range` URL param; scopes everything on the page. */
export function RangeFilter({ defaultRange = "all", className }: { defaultRange?: RangePreset; className?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const current = (params.get("range") as RangePreset) ?? (params.get("from") || params.get("to") ? "" : defaultRange);
  return (
    <ToggleGroup
      type="single"
      size="sm"
      variant="outline"
      value={current}
      className={cn(pending && "opacity-60", className)}
      aria-label="Date range"
      onValueChange={(v) => {
        if (!v) return;
        const sp = new URLSearchParams(params);
        sp.delete("from");
        sp.delete("to");
        if (v === defaultRange) sp.delete("range");
        else sp.set("range", v);
        start(() => router.push(`${pathname}${sp.size ? `?${sp}` : ""}`, { scroll: false }));
      }}
    >
      {RANGE_PRESETS.map((r) => (
        <ToggleGroupItem key={r} value={r}>
          {LABELS[r]}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
