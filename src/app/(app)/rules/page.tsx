import { requireUser } from "@/server/session";
import { getPrefs } from "@/server/queries/accounts";
import { getPropRulesOverview } from "@/server/queries/rules-overview";
import { listTradingRules, listViolations, parseViolationFilters } from "@/server/queries/rules-personal";
import { getFilterOptions } from "@/server/queries/options";
import { PageHeader, Section } from "@/components/app/page-header";
import { RangeFilter } from "@/components/app/range-filter";
import { PropRulesOverview } from "@/components/rules/prop-rules-overview";
import { TradingRulesManager } from "@/components/rules/trading-rules-manager";
import { ViolationsList } from "@/components/rules/violations-list";
import { UrlFilterRow } from "@/components/payouts/url-filter-row";

export const metadata = { title: "Rules" };

export default async function RulesPage(props: PageProps<"/rules">) {
  const user = await requireUser();
  const sp = await props.searchParams;
  const vf = parseViolationFilters(sp);
  const [prefs, overview, rules, violations, options] = await Promise.all([
    getPrefs(user.id),
    getPropRulesOverview(user.id),
    listTradingRules(user.id),
    listViolations(user.id, vf),
    getFilterOptions(user.id),
  ]);
  const accounts = options.accounts;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Rules" description="Prop-firm limits for each account, and the trading rules you set for yourself." />

      <Section title="Prop-firm rules" description="Live status on closed-trade balance. Edit an account’s rules on its Rules tab.">
        <PropRulesOverview rows={overview} />
        <ul className="mt-6 grid gap-1 text-xs text-muted-foreground">
          <li>Limits are measured on closed-trade balance; the journal can’t see floating equity, so an intraday equity breach on the platform may not show here.</li>
          <li>Weekend holding and max position size are checked on every trade. News-trading restrictions are <span className="text-foreground">not checked automatically</span> — PropTrack has no economic calendar, so keep track of news events yourself.</li>
        </ul>
      </Section>

      <Section title="My trading rules" description="Personal discipline rules — separate from prop-firm limits">
        <TradingRulesManager rules={rules} accounts={accounts.map((a) => ({ id: a.id, name: a.name }))} timezone={prefs.timezone} />
      </Section>

      <Section title="Recent violations" description={`${violations.total} in range${violations.total > violations.rows.length ? ` · showing the latest ${violations.rows.length}` : ""}`}>
        <UrlFilterRow
          className="mb-4"
          fields={[
            { kind: "single", param: "vsource", label: "Source", allLabel: "All sources", options: [{ value: "PROP_RULE", label: "Prop-firm rules" }, { value: "PERSONAL_RULE", label: "My rules" }] },
            { kind: "single", param: "vseverity", label: "Severity", allLabel: "Warnings & breaches", options: [{ value: "WARNING", label: "Warnings" }, { value: "BREACH", label: "Breaches" }] },
            { kind: "multi", param: "vaccounts", label: "Account", options: accounts.map((a) => ({ value: a.id, label: a.name })) },
            { kind: "multi", param: "vrules", label: "Rule", options: violations.ruleKeys },
          ]}
        >
          <RangeFilter defaultRange="90d" />
        </UrlFilterRow>
        <ViolationsList rows={violations.rows} timezone={prefs.timezone} />
      </Section>
    </div>
  );
}
