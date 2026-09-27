"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MultiSelect } from "@/components/filters/multi-select";
import { cn } from "@/lib/utils";

export type UrlFilterField =
  | { kind: "multi"; param: string; label: string; options: { value: string; label: string }[] }
  | { kind: "single"; param: string; label: string; allLabel: string; options: { value: string; label: string }[] };

/**
 * A row of URL-bound filters (the page re-renders from searchParams). Only the params named in
 * `fields` are changed; unrelated params (e.g. `range`) are kept.
 */
export function UrlFilterRow({ fields, className, children }: { fields: UrlFilterField[]; className?: string; children?: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const push = (sp: URLSearchParams) => {
    sp.delete("new");
    sp.delete("edit");
    start(() => router.push(`${pathname}${sp.size ? `?${sp}` : ""}`, { scroll: false }));
  };
  const set = (param: string, v: string | string[] | null) => {
    const sp = new URLSearchParams(params);
    const val = Array.isArray(v) ? v.join(",") : v;
    if (val) sp.set(param, val);
    else sp.delete(param);
    push(sp);
  };
  const active = fields.filter((f) => params.get(f.param)).length;
  return (
    <div className={cn("flex flex-wrap items-center gap-2 transition-opacity", pending && "opacity-60", className)}>
      {children}
      {fields.map((f) =>
        f.kind === "multi" ? (
          f.options.length > 0 && (
            <MultiSelect
              key={f.param}
              label={f.label}
              options={f.options}
              value={(params.get(f.param) ?? "").split(",").filter(Boolean)}
              onChange={(v) => set(f.param, v)}
            />
          )
        ) : (
          <Select key={f.param} value={params.get(f.param) ?? "__all__"} onValueChange={(v) => set(f.param, v === "__all__" ? null : v)}>
            <SelectTrigger size="sm" className={cn("w-auto", params.get(f.param) && "border-primary/50 bg-primary/10")} aria-label={f.label}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">{f.allLabel}</SelectItem>
              {f.options.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ),
      )}
      {active > 0 && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            const sp = new URLSearchParams(params);
            for (const f of fields) sp.delete(f.param);
            push(sp);
          }}
        >
          <X /> Clear filters
        </Button>
      )}
    </div>
  );
}
