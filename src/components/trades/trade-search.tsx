"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** URL-bound search box (`?q=`): symbol, notes, setup, strategy, account, tags and journal text. */
export function TradeSearch({ placeholder = "Search symbol, notes, setup, strategy, tag, lesson…", className }: { placeholder?: string; className?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const urlQ = params.get("q") ?? "";
  const [value, setValue] = useState(urlQ);
  const [pending, start] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep the box in sync when the URL changes elsewhere (e.g. "Clear filters").
  const [lastUrlQ, setLastUrlQ] = useState(urlQ);
  if (urlQ !== lastUrlQ) {
    setLastUrlQ(urlQ);
    setValue(urlQ);
  }

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  const commit = (q: string) => {
    const sp = new URLSearchParams(params);
    if (q.trim()) sp.set("q", q.trim());
    else sp.delete("q");
    sp.delete("page");
    start(() => router.replace(`${pathname}${sp.size ? `?${sp}` : ""}`, { scroll: false }));
  };

  return (
    <form
      role="search"
      className={cn("relative w-full max-w-md", className)}
      onSubmit={(e) => {
        e.preventDefault();
        if (timer.current) clearTimeout(timer.current);
        commit(value);
      }}
    >
      <Search className={cn("pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground", pending && "animate-pulse")} aria-hidden />
      <label htmlFor="trade-search" className="sr-only">
        Search trades
      </label>
      <Input
        id="trade-search"
        type="search"
        value={value}
        maxLength={100}
        placeholder={placeholder}
        className="pl-8"
        onChange={(e) => {
          const q = e.target.value;
          setValue(q);
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => commit(q), 350);
        }}
      />
    </form>
  );
}
