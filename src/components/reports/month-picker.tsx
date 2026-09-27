"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

function shift(month: string, delta: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Month selector bound to the `month` URL param (the monthly report period). */
export function MonthPicker({ month, max }: { month: string; max: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const go = (m: string) => {
    if (!/^\d{4}-\d{2}$/.test(m)) return;
    const sp = new URLSearchParams(params);
    sp.set("month", m);
    start(() => router.push(`${pathname}?${sp}`, { scroll: false }));
  };
  return (
    <div className={cn("flex items-center gap-1", pending && "opacity-60")}>
      <Button type="button" variant="outline" size="icon" className="size-8" aria-label="Previous month" onClick={() => go(shift(month, -1))}>
        <ChevronLeft />
      </Button>
      <Input type="month" aria-label="Report month" value={month} max={max} onChange={(e) => go(e.target.value)} className="h-8 w-40" />
      <Button type="button" variant="outline" size="icon" className="size-8" aria-label="Next month" disabled={month >= max} onClick={() => go(shift(month, 1))}>
        <ChevronRight />
      </Button>
    </div>
  );
}
