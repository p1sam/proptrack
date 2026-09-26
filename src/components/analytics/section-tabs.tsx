import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * URL-bound section tabs rendered on the server: each tab is a link that keeps every other search
 * param (filters) and only swaps `param`. Only the active section is computed into the page.
 */
export function SectionTabs({
  tabs,
  active,
  searchParams,
  param = "tab",
  pathname,
  className,
}: {
  tabs: { value: string; label: string }[];
  active: string;
  searchParams: Record<string, string | string[] | undefined>;
  param?: string;
  pathname: string;
  className?: string;
}) {
  const hrefFor = (value: string, isDefault: boolean) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(searchParams)) {
      if (k === param || v === undefined) continue;
      if (Array.isArray(v)) v.forEach((x) => sp.append(k, x));
      else sp.set(k, v);
    }
    if (!isDefault) sp.set(param, value);
    return `${pathname}${sp.size ? `?${sp}` : ""}`;
  };
  return (
    <nav aria-label="Sections" className={cn("inline-flex h-8 w-fit items-center rounded-lg bg-muted p-[3px] text-muted-foreground", className)}>
      {tabs.map((t, i) => (
        <Link
          key={t.value}
          href={hrefFor(t.value, i === 0)}
          scroll={false}
          aria-current={t.value === active ? "page" : undefined}
          className={cn(
            "inline-flex h-full items-center rounded-md px-3 text-sm font-medium transition-colors hover:text-foreground",
            t.value === active && "bg-background text-foreground shadow-sm dark:bg-input/30",
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
