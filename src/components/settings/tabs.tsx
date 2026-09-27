import Link from "next/link";
import { ArrowRight, Building2, CheckCircle2, ExternalLink, FileSpreadsheet, Plug, TriangleAlert } from "lucide-react";
import { Section } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { adapterSummaries } from "@/lib/import/adapters";
import {
  getCurrenciesTab,
  getInstrumentsTab,
  getPreferencesTab,
  getProfileTab,
  getPropFirmsTab,
  getSessionsTab,
  getStrategiesTab,
  getTagsTab,
} from "@/server/queries/settings";
import { CATEGORY_KINDS, plural, timeZoneList } from "./logic";
import { OtherSessions, PasswordForm, ProfileForm } from "./profile-forms";
import { PreferencesForm } from "./preferences-form";
import { SessionTimeline } from "./session-timeline";
import { SessionsManager } from "./sessions-manager";
import { StrategiesManager } from "./strategies-manager";
import { InstrumentsManager } from "./instruments-manager";
import { CategoryList, TagsManager } from "./tags-manager";
import { RatesManager } from "./rates-manager";

/** Server components, one per Settings tab. Each loads only its own data. */

export async function ProfileTab({ userId }: { userId: string }) {
  const { user, otherSessions } = await getProfileTab(userId);
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Section title="Profile" description="Your name is shown in the app header and reports.">
        <ProfileForm name={user.name} email={user.email} />
      </Section>
      <Section title="Password" description="Changing your password signs out every other session.">
        <PasswordForm />
      </Section>
      <Section title="Sessions" description="Browsers and devices signed in to your account." className="lg:col-span-2">
        <OtherSessions count={otherSessions} />
      </Section>
    </div>
  );
}

export async function PreferencesTab({ userId }: { userId: string }) {
  const { prefs, accounts, trades } = await getPreferencesTab(userId);
  return (
    <Section title="Preferences" description="Defaults used across calculations, analytics and new trades.">
      <PreferencesForm prefs={prefs} zones={timeZoneList([prefs.timezone])} accounts={accounts} trades={trades} />
    </Section>
  );
}

export async function SessionsTab({ userId }: { userId: string }) {
  const { sessions, timezone } = await getSessionsTab(userId);
  const zones = new Set(sessions.map((s) => s.timezone));
  const displayTz = zones.size === 1 ? [...zones][0] : timezone;
  return (
    <div className="flex flex-col gap-5">
      <Section title="How sessions are assigned" description="Every trade is tagged with a session from its open time.">
        <div className="flex flex-col gap-4">
          <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-muted-foreground">
            <li>Active sessions are checked in priority order (lowest number first); the first whose window contains the open time wins.</li>
            <li>That is how an overlap session works: &ldquo;London/NY Overlap&rdquo; has a lower number than London and New York, so trades in the overlap are tagged Overlap rather than London.</li>
            <li>Windows are wall-clock times in the session&apos;s own timezone, so daylight-saving shifts are handled for you. An end time before the start wraps past midnight.</li>
            <li>Any change here recalculates the session of every trade.</li>
          </ul>
          {sessions.length > 0 && <SessionTimeline sessions={sessions} displayTz={displayTz} />}
        </div>
      </Section>
      <Section title="Sessions" description={plural(sessions.length, "session")}>
        <SessionsManager sessions={sessions} zones={timeZoneList([timezone, ...zones])} defaultTz={timezone} />
      </Section>
    </div>
  );
}

export async function StrategiesTab({ userId }: { userId: string }) {
  const strategies = await getStrategiesTab(userId);
  return (
    <Section
      title="Strategies"
      description="Archived strategies stay on their trades and in analytics, but are hidden from new-trade pickers."
      actions={
        <Link href="/strategies" className="text-xs text-muted-foreground hover:text-foreground">
          Strategy analytics
        </Link>
      }
    >
      <StrategiesManager strategies={strategies} />
    </Section>
  );
}

export async function InstrumentsTab({ userId }: { userId: string }) {
  const instruments = await getInstrumentsTab(userId);
  return (
    <Section title="Instruments" description="Point value turns price moves into money for P&L, risk and R.">
      <div className="flex flex-col gap-4">
        <div className="rounded-md bg-muted/50 p-3 text-sm text-muted-foreground">
          <p>
            <span className="font-medium text-foreground">Point value</span> is the account-currency value of a 1.0 price move per 1 unit of quantity, e.g. 100000 for a standard FX lot on a USD-quoted pair (EURUSD moving
            1.0000 on 1 lot = $100,000), 100 for XAUUSD with 100-oz lots, or 1 for most index CFDs. Check your broker&apos;s contract specification.
          </p>
          <p className="mt-2">Each trade snapshots the point value when it is entered, so editing it here only affects new trades.</p>
        </div>
        <InstrumentsManager instruments={instruments} />
      </div>
    </Section>
  );
}

export async function TagsTab({ userId }: { userId: string }) {
  const { tags, categories } = await getTagsTab(userId);
  return (
    <div className="flex flex-col gap-5">
      <Section title="Tags" description="Label behaviour on trades: positive habits, mistakes, or neutral context.">
        <TagsManager tags={tags} />
      </Section>
      <Section title="Categories" description="The option lists offered by the trade form. Trades store the chosen text, so renaming or deleting an option doesn't change existing trades.">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {CATEGORY_KINDS.map((k) => (
            <CategoryList key={k.kind} kind={k.kind} label={k.label} items={categories.filter((c) => c.kind === k.kind)} />
          ))}
        </div>
      </Section>
    </div>
  );
}

export async function PropFirmsTab({ userId }: { userId: string }) {
  const firms = await getPropFirmsTab(userId);
  return (
    <Section
      title="Prop firms"
      description="Firms and their rule templates are managed with your accounts."
      actions={
        <Button asChild size="sm" variant="outline">
          <Link href="/accounts">
            Manage on Accounts <ArrowRight />
          </Link>
        </Button>
      }
    >
      {firms.length === 0 ? (
        <EmptyState icon={<Building2 />} title="No prop firms yet" description="Add a firm from the Accounts page. A rule template pre-fills the rules of every new account for that firm." />
      ) : (
        <ul className="flex flex-col divide-y">
          {firms.map((f) => (
            <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <div className="flex min-w-0 items-center gap-2">
                <span className="truncate font-medium">{f.name}</span>
                {f.hasTemplate && <Badge variant="secondary">Rule template</Badge>}
                {f.website && (
                  <a href={f.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                    Website <ExternalLink className="size-3" />
                    <span className="sr-only">(opens in a new tab)</span>
                  </a>
                )}
              </div>
              <span className="text-sm text-muted-foreground tabular">{plural(f.accounts, "account")}</span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

export async function CurrenciesTab({ userId }: { userId: string }) {
  const { defaultCurrency, timezone, rates, accountCurrencies, missing } = await getCurrenciesTab(userId);
  const missingSet = new Set(missing);
  return (
    <div className="flex flex-col gap-5">
      <Section title="How conversion works" description={`Your default currency is ${defaultCurrency}.`}>
        <div className="flex flex-col gap-3 text-sm text-muted-foreground">
          <p>
            Each account keeps its own currency. Portfolio views (dashboard, analytics, reports) convert every account to {defaultCurrency} using the rates below — there is no live feed, so update them
            when they drift. A rate for EUR/USD also converts USD to EUR (the inverse is derived).
          </p>
          <p>Accounts without a rate to {defaultCurrency} are excluded from portfolio totals, and the page says so, rather than summing different currencies. Single-account views always use the account&apos;s own currency.</p>
          <p>
            Change the default currency under{" "}
            <Link href="/settings?tab=preferences" className="text-foreground underline underline-offset-2">
              Preferences
            </Link>
            .
          </p>
        </div>
      </Section>

      <Section title="Account currencies">
        {accountCurrencies.length === 0 ? (
          <p className="text-sm text-muted-foreground">No accounts yet.</p>
        ) : (
          <ul className="flex flex-col divide-y">
            {accountCurrencies.map((c) => (
              <li key={c.currency} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span>
                  <span className="font-medium">{c.currency}</span> <span className="text-muted-foreground">· {plural(c.accounts, "account")}</span>
                </span>
                {c.currency === defaultCurrency ? (
                  <span className="text-muted-foreground">Default currency</span>
                ) : missingSet.has(c.currency) ? (
                  <span className="inline-flex items-center gap-1 text-warning">
                    <TriangleAlert className="size-4" /> No rate to {defaultCurrency} — excluded from totals
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-profit">
                    <CheckCircle2 className="size-4" /> Converted to {defaultCurrency}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Exchange rates" description="1 base = rate × quote.">
        <RatesManager rates={rates} defaultCurrency={defaultCurrency} missing={missing} timezone={timezone} />
      </Section>
    </div>
  );
}

export function IntegrationsTab() {
  const adapters = adapterSummaries();
  const available = adapters.filter((a) => a.status === "available");
  const later = adapters.filter((a) => a.status !== "available");
  return (
    <div className="flex flex-col gap-5">
      <Section title="Available now">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <FileSpreadsheet className="mt-0.5 size-5 text-muted-foreground" />
            <div>
              <p className="flex items-center gap-2 text-sm font-medium">
                CSV import <Badge variant="secondary">Available</Badge>
              </p>
              <p className="text-sm text-muted-foreground">
                Import trades from a file. Supported formats: {available.map((a) => a.label).join(", ")}. Columns are mapped for you and duplicates are detected.
              </p>
            </div>
          </div>
          <Button asChild variant="outline" className="shrink-0">
            <Link href="/trades/import">
              Import trades <ArrowRight />
            </Link>
          </Button>
        </div>
      </Section>

      <Section title="Coming later" description="Direct platform connections are not built yet. Until then, export your history and use CSV import.">
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {later.map((a) => (
            <li key={a.id} className="flex flex-col gap-2 rounded-lg border p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-sm font-medium">
                  <Plug className="size-4 text-muted-foreground" /> {a.label}
                </span>
                <Badge variant="outline">Coming later</Badge>
              </div>
              <p className="text-sm text-muted-foreground">{a.description}</p>
              <p className="text-xs text-muted-foreground">{a.kind === "api" ? "Account sync" : `File import${a.formats.length ? ` · ${a.formats.join(", ")}` : ""}`}</p>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
