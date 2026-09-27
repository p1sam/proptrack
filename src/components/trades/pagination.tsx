import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

type SP = Record<string, string | string[] | undefined>;

function hrefFor(path: string, params: SP, page: number) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (k === "page" || v === undefined) continue;
    for (const x of Array.isArray(v) ? v : [v]) sp.append(k, x);
  }
  if (page > 1) sp.set("page", String(page));
  return `${path}${sp.size ? `?${sp}` : ""}`;
}

/** Server-rendered prev/next pagination that keeps every other query param. */
export function Pagination({ path, params, page, pages, total, pageSize, noun = "trades" }: { path: string; params: SP; page: number; pages: number; total: number; pageSize: number; noun?: string }) {
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-2 text-sm">
      <span className="text-muted-foreground tabular">
        {from}–{to} of {total} {noun}
      </span>
      <div className="flex items-center gap-2">
        {page > 1 ? (
          <Button variant="outline" size="sm" asChild>
            <Link href={hrefFor(path, params, page - 1)} scroll={false} rel="prev">
              <ChevronLeft /> Previous
            </Link>
          </Button>
        ) : (
          <Button variant="outline" size="sm" disabled>
            <ChevronLeft /> Previous
          </Button>
        )}
        <span className="text-muted-foreground tabular">
          Page {page} of {pages}
        </span>
        {page < pages ? (
          <Button variant="outline" size="sm" asChild>
            <Link href={hrefFor(path, params, page + 1)} scroll={false} rel="next">
              Next <ChevronRight />
            </Link>
          </Button>
        ) : (
          <Button variant="outline" size="sm" disabled>
            Next <ChevronRight />
          </Button>
        )}
      </div>
    </nav>
  );
}
