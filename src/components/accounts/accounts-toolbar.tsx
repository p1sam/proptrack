"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface ToolbarTab {
  key: string;
  label: string;
  count: number;
}

/** Status filter tabs (URL `status`) and a search box (URL `q`) for the accounts list. */
export function AccountsToolbar({ tabs, current, query }: { tabs: ToolbarTab[]; current: string; query: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(query);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (q === query) return;
    const t = setTimeout(() => {
      const sp = new URLSearchParams(params);
      if (q.trim()) sp.set("q", q.trim());
      else sp.delete("q");
      start(() => router.replace(`${pathname}${sp.size ? `?${sp}` : ""}`, { scroll: false }));
    }, 250);
    return () => clearTimeout(t);
  }, [q, query, params, pathname, router]);

  const hrefFor = (key: string) => {
    const sp = new URLSearchParams(params);
    sp.delete("new");
    if (key === "all") sp.delete("status");
    else sp.set("status", key);
    return `${pathname}${sp.size ? `?${sp}` : ""}`;
  };

  return (
    <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
      <nav aria-label="Filter accounts by status" className="-mx-1 overflow-x-auto px-1">
        <ul className="inline-flex h-8 items-center gap-0.5 rounded-lg bg-muted p-[3px] text-muted-foreground">
          {tabs.map((t) => {
            const active = t.key === current;
            return (
              <li key={t.key}>
                <Link
                  href={hrefFor(t.key)}
                  scroll={false}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "inline-flex h-[26px] items-center gap-1.5 rounded-md px-2.5 text-sm font-medium whitespace-nowrap transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                    active && "bg-background text-foreground shadow-sm",
                  )}
                >
                  {t.label}
                  <span className="text-xs text-muted-foreground tabular">{t.count}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className={cn("relative w-full lg:w-72", pending && "opacity-70")}>
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, number, firm…" className="h-8 pl-8" aria-label="Search accounts" type="search" />
      </div>
    </div>
  );
}
