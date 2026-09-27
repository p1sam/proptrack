import Link from "next/link";
import { cn } from "@/lib/utils";

export const SETTINGS_TABS = [
  { key: "profile", label: "Profile" },
  { key: "preferences", label: "Preferences" },
  { key: "sessions", label: "Sessions" },
  { key: "strategies", label: "Strategies" },
  { key: "instruments", label: "Instruments" },
  { key: "tags", label: "Tags & categories" },
  { key: "firms", label: "Prop firms" },
  { key: "currencies", label: "Currencies" },
  { key: "integrations", label: "Integrations" },
] as const;
export type SettingsTab = (typeof SETTINGS_TABS)[number]["key"];

export function parseSettingsTab(v: string | string[] | undefined): SettingsTab {
  const s = Array.isArray(v) ? v[0] : v;
  return SETTINGS_TABS.some((t) => t.key === s) ? (s as SettingsTab) : "profile";
}

/** URL-bound (?tab=) navigation. Only the active tab is rendered on the server. */
export function SettingsNav({ current }: { current: SettingsTab }) {
  return (
    <nav aria-label="Settings sections" className="-mx-4 overflow-x-auto border-b px-4 [scrollbar-width:none] md:mx-0 md:px-0">
      <ul className="flex min-w-max gap-1">
        {SETTINGS_TABS.map((t) => {
          const active = t.key === current;
          return (
            <li key={t.key}>
              <Link
                href={t.key === "profile" ? "/settings" : `/settings?tab=${t.key}`}
                scroll={false}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "-mb-px inline-flex h-9 items-center border-b-2 border-transparent px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  active && "border-primary text-foreground",
                )}
              >
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
