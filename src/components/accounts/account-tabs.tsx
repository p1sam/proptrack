import Link from "next/link";
import { cn } from "@/lib/utils";

export const ACCOUNT_TABS = [
  { key: "overview", label: "Overview" },
  { key: "trades", label: "Trades" },
  { key: "analytics", label: "Analytics" },
  { key: "journal", label: "Journal" },
  { key: "rules", label: "Rules" },
  { key: "payouts", label: "Payouts" },
  { key: "timeline", label: "Timeline" },
] as const;
export type AccountTab = (typeof ACCOUNT_TABS)[number]["key"];

export function parseAccountTab(v: string | string[] | undefined): AccountTab {
  const s = Array.isArray(v) ? v[0] : v;
  return ACCOUNT_TABS.some((t) => t.key === s) ? (s as AccountTab) : "overview";
}

/** URL-bound (?tab=) tab navigation for the account page. Only the active tab is rendered on the server. */
export function AccountTabsNav({ accountId, current, counts }: { accountId: string; current: AccountTab; counts?: Partial<Record<AccountTab, number>> }) {
  return (
    <nav aria-label="Account sections" className="-mx-4 overflow-x-auto border-b px-4 md:mx-0 md:px-0">
      <ul className="flex min-w-max gap-1">
        {ACCOUNT_TABS.map((t) => {
          const active = t.key === current;
          const n = counts?.[t.key];
          return (
            <li key={t.key}>
              <Link
                href={t.key === "overview" ? `/accounts/${accountId}` : `/accounts/${accountId}?tab=${t.key}`}
                scroll={false}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "-mb-px inline-flex h-9 items-center gap-1.5 border-b-2 border-transparent px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  active && "border-primary text-foreground",
                )}
              >
                {t.label}
                {n !== undefined && n > 0 && <span className="rounded bg-muted px-1 text-[11px] tabular text-muted-foreground">{n}</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
