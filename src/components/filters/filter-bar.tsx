"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RangeFilter } from "@/components/app/range-filter";
import { EMOTIONS } from "@/lib/calc/behavior";
import { WEEKDAY_NAMES } from "@/lib/calc/time";
import { cn } from "@/lib/utils";
import { MultiSelect } from "./multi-select";

/** Serializable subset of FilterOptions passed from the server page. */
export interface FilterBarOptions {
  accounts: { id: string; name: string }[];
  firms: { id: string; name: string }[];
  strategies: { id: string; name: string }[];
  symbols: string[];
  sessions: { id: string; name: string }[];
  setups: string[];
  tags: { id: string; name: string }[];
}

type FilterKey = "accounts" | "firms" | "strategies" | "symbols" | "sessions" | "setups" | "tags" | "weekdays" | "direction" | "outcome" | "status";

const ADVANCED = ["minPnl", "maxPnl", "minR", "maxR", "emotion", "emotionMin", "emotionMax"] as const;

/**
 * One row of combinable filters bound to the URL. Every filter narrows the same trade set, and
 * the server page re-renders all stats and charts from it. `hide` removes filters that don't
 * apply to a page (e.g. accounts on an account detail page).
 */
export function FilterBar({ options, hide = [], showStatus = false, showRange = true, className }: { options: FilterBarOptions; hide?: FilterKey[]; showStatus?: boolean; showRange?: boolean; className?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();

  const getList = (k: string) => (params.get(k) ?? "").split(",").filter(Boolean);
  const push = (sp: URLSearchParams) => {
    sp.delete("page");
    start(() => router.push(`${pathname}${sp.size ? `?${sp}` : ""}`, { scroll: false }));
  };
  const setList = (k: string, v: string[]) => {
    const sp = new URLSearchParams(params);
    if (v.length) sp.set(k, v.join(","));
    else sp.delete(k);
    push(sp);
  };
  const setOne = (k: string, v: string | null) => {
    const sp = new URLSearchParams(params);
    if (v) sp.set(k, v);
    else sp.delete(k);
    push(sp);
  };
  const show = (k: FilterKey) => !hide.includes(k);
  const keys = ["accounts", "firms", "strategies", "symbols", "sessions", "setups", "tags", "weekdays", "direction", "outcome", "q", ...ADVANCED];
  const activeCount = keys.filter((k) => params.get(k)).length;
  const advancedCount = ADVANCED.filter((k) => params.get(k)).length;

  return (
    <div className={cn("flex flex-wrap items-center gap-2 transition-opacity", pending && "opacity-60", className)}>
      {showRange && <RangeFilter />}
      {show("accounts") && options.accounts.length > 0 && (
        <MultiSelect label="Account" options={options.accounts.map((a) => ({ value: a.id, label: a.name }))} value={getList("accounts")} onChange={(v) => setList("accounts", v)} />
      )}
      {show("firms") && options.firms.length > 0 && (
        <MultiSelect label="Prop firm" options={options.firms.map((f) => ({ value: f.id, label: f.name }))} value={getList("firms")} onChange={(v) => setList("firms", v)} />
      )}
      {show("strategies") && (
        <MultiSelect label="Strategy" options={[...options.strategies.map((s) => ({ value: s.id, label: s.name })), { value: "none", label: "No strategy" }]} value={getList("strategies")} onChange={(v) => setList("strategies", v)} />
      )}
      {show("symbols") && options.symbols.length > 0 && (
        <MultiSelect label="Instrument" options={options.symbols.map((s) => ({ value: s, label: s }))} value={getList("symbols")} onChange={(v) => setList("symbols", v)} />
      )}
      {show("sessions") && (
        <MultiSelect label="Session" options={[...options.sessions.map((s) => ({ value: s.id, label: s.name })), { value: "none", label: "Outside sessions" }]} value={getList("sessions")} onChange={(v) => setList("sessions", v)} />
      )}
      {show("setups") && options.setups.length > 0 && (
        <MultiSelect label="Setup" options={options.setups.map((s) => ({ value: s, label: s }))} value={getList("setups")} onChange={(v) => setList("setups", v)} />
      )}
      {show("tags") && options.tags.length > 0 && (
        <MultiSelect label="Tag" options={options.tags.map((t) => ({ value: t.id, label: t.name }))} value={getList("tags")} onChange={(v) => setList("tags", v)} />
      )}
      {show("weekdays") && (
        <MultiSelect label="Weekday" searchable={false} options={[1, 2, 3, 4, 5, 6, 0].map((d) => ({ value: String(d), label: WEEKDAY_NAMES[d] }))} value={getList("weekdays")} onChange={(v) => setList("weekdays", v)} />
      )}
      {show("direction") && (
        <Select value={params.get("direction") ?? "any"} onValueChange={(v) => setOne("direction", v === "any" ? null : v)}>
          <SelectTrigger size="sm" className={cn("w-auto", params.get("direction") && "border-primary/50 bg-primary/10")} aria-label="Direction">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Long &amp; short</SelectItem>
            <SelectItem value="LONG">Long only</SelectItem>
            <SelectItem value="SHORT">Short only</SelectItem>
          </SelectContent>
        </Select>
      )}
      {show("outcome") && (
        <Select value={params.get("outcome") ?? "any"} onValueChange={(v) => setOne("outcome", v === "any" ? null : v)}>
          <SelectTrigger size="sm" className={cn("w-auto", params.get("outcome") && "border-primary/50 bg-primary/10")} aria-label="Outcome">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Wins &amp; losses</SelectItem>
            <SelectItem value="WIN">Winners</SelectItem>
            <SelectItem value="LOSS">Losers</SelectItem>
            <SelectItem value="BREAKEVEN">Break-even</SelectItem>
          </SelectContent>
        </Select>
      )}
      {showStatus && (
        <Select value={params.get("status") ?? "CLOSED"} onValueChange={(v) => setOne("status", v === "CLOSED" ? null : v)}>
          <SelectTrigger size="sm" className="w-auto" aria-label="Status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="CLOSED">Closed</SelectItem>
            <SelectItem value="OPEN">Open</SelectItem>
            <SelectItem value="ALL">All trades</SelectItem>
          </SelectContent>
        </Select>
      )}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className={cn(advancedCount && "border-primary/50 bg-primary/10")}>
            <SlidersHorizontal /> More{advancedCount ? ` · ${advancedCount}` : ""}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72">
          <form
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const sp = new URLSearchParams(params);
              for (const k of ADVANCED) {
                const v = String(fd.get(k) ?? "").trim();
                if (v && v !== "none") sp.set(k, v);
                else sp.delete(k);
              }
              push(sp);
            }}
          >
            <div className="grid grid-cols-2 gap-2">
              <div className="grid gap-1">
                <Label htmlFor="f-minPnl" className="text-xs">Min P&amp;L</Label>
                <Input id="f-minPnl" name="minPnl" inputMode="decimal" defaultValue={params.get("minPnl") ?? ""} className="h-8" />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="f-maxPnl" className="text-xs">Max P&amp;L</Label>
                <Input id="f-maxPnl" name="maxPnl" inputMode="decimal" defaultValue={params.get("maxPnl") ?? ""} className="h-8" />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="f-minR" className="text-xs">Min R</Label>
                <Input id="f-minR" name="minR" inputMode="decimal" defaultValue={params.get("minR") ?? ""} className="h-8" />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="f-maxR" className="text-xs">Max R</Label>
                <Input id="f-maxR" name="maxR" inputMode="decimal" defaultValue={params.get("maxR") ?? ""} className="h-8" />
              </div>
            </div>
            <div className="grid gap-1">
              <Label htmlFor="f-emotion" className="text-xs">Emotional state</Label>
              <select id="f-emotion" name="emotion" defaultValue={params.get("emotion") ?? "none"} className="h-8 rounded-md border bg-transparent px-2 text-sm">
                <option value="none">Any</option>
                {EMOTIONS.map((e) => (
                  <option key={e} value={e}>
                    {e[0].toUpperCase() + e.slice(1)}
                  </option>
                ))}
              </select>
              <div className="grid grid-cols-2 gap-2">
                <Input name="emotionMin" aria-label="Minimum rating" placeholder="Min (1–5)" inputMode="numeric" defaultValue={params.get("emotionMin") ?? ""} className="h-8" />
                <Input name="emotionMax" aria-label="Maximum rating" placeholder="Max (1–5)" inputMode="numeric" defaultValue={params.get("emotionMax") ?? ""} className="h-8" />
              </div>
            </div>
            <Button type="submit" size="sm">Apply</Button>
          </form>
        </PopoverContent>
      </Popover>
      {activeCount > 0 && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            const sp = new URLSearchParams(params);
            for (const k of keys) sp.delete(k);
            push(sp);
          }}
        >
          <X /> Clear filters
        </Button>
      )}
    </div>
  );
}
