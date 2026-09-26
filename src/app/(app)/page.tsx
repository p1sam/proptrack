import Link from "next/link";
import { ArrowRight, Layers, Lightbulb, ShieldAlert } from "lucide-react";
import { requireUser } from "@/server/session";
import { getDashboard } from "@/server/queries/dashboard";
import { parseTradeFilters } from "@/lib/filters";
import { formatDateTime, formatMoney, formatPct, formatRatio, formatMonthKey } from "@/lib/format";
import { PageHeader, Section } from "@/components/app/page-header";
import { StatCard, StatGrid } from "@/components/app/stat-card";
import { Pnl, RValue } from "@/components/app/pnl";
import { RangeFilter } from "@/components/app/range-filter";
import { EmptyState } from "@/components/app/empty-state";
import { PerformanceChart } from "@/components/charts/performance-chart";
import { AccountCard } from "@/components/accounts/account-card";
import { MonthGrid } from "@/components/calendar/month-grid";
import { GroupTable } from "@/components/analytics/group-table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage(props: PageProps<"/">) {
  const user = await requireUser();
  const filters = parseTradeFilters(await props.searchParams);
  const d = await getDashboard(user.id, filters);
  const ccy = d.prefs.currency;
  const p = d.portfolio;
  const active = d.accounts.filter((a) => a.group === "challenge" || a.group === "funded");

  if (d.accounts.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={`Welcome, ${user.name}`} description="Start by adding your first prop-firm account." />
        <EmptyState
          icon={<Layers />}
          title="No accounts yet"
          description="Add a challenge, funded or personal account. Its rules (profit target, daily loss, max drawdown) drive every progress bar and warning in PropTrack."
          action={
            <Button asChild>
              <Link href="/accounts?new=1">Add account</Link>
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Dashboard" description="How you are doing across every account." actions={<RangeFilter />} />

      <StatGrid>
        <StatCard label="Total P&L" value={<Pnl value={d.kpis.totalPnl} currency={ccy} />} sub="All time, all accounts" hint="Net of commission and swap. Accounts in other currencies are converted with your Settings rates." />
        <StatCard label="Today" value={<Pnl value={d.kpis.todayPnl} currency={ccy} />} />
        <StatCard label="This week" value={<Pnl value={d.kpis.weekPnl} currency={ccy} />} />
        <StatCard label="This month" value={<Pnl value={d.kpis.monthPnl} currency={ccy} />} />
        <StatCard label="Payouts received" value={formatMoney(p.totalPayouts, ccy)} sub={`Fees ${formatMoney(p.totalFees, ccy)}`} />
        <StatCard
          label="Current drawdown"
          value={d.kpis.currentDrawdown ? formatMoney(-d.kpis.currentDrawdown, ccy) : formatMoney(0, ccy)}
          sub={d.kpis.currentDrawdownPct !== null ? formatPct(-d.kpis.currentDrawdownPct) : undefined}
          tone={d.kpis.currentDrawdown ? "loss" : undefined}
          hint="Decline from the peak of the combined equity curve in the selected range."
        />
        <StatCard label="Win rate" value={formatPct(d.kpis.winRate)} sub={`${d.kpis.trades} trades`} hint="Wins ÷ (wins + losses). Break-even trades are excluded. Copies of the same trade across accounts count once." />
        <StatCard label="Profit factor" value={d.kpis.profitFactor === null ? "—" : formatRatio(d.kpis.profitFactor)} hint="Gross profit ÷ gross loss." />
      </StatGrid>

      <div className="grid gap-5 xl:grid-cols-3">
        <Section title="Equity curve" description={`Combined, in ${ccy}${d.dataset.collapsed ? " · copied trades counted once for rates" : ""}`} className="xl:col-span-2">
          <PerformanceChart equity={d.analytics.equity} daily={d.analytics.daily} currency={ccy} startingCapital={d.dataset.startingCapital} />
          {d.dataset.excluded.count > 0 && (
            <p className="mt-2 text-xs text-warning">
              {d.dataset.excluded.count} trades in {d.dataset.excluded.currencies.join(", ")} are excluded — add an exchange rate in Settings.
            </p>
          )}
        </Section>

        <Section title="Prop-firm portfolio" actions={<Link href="/accounts" className="text-xs text-muted-foreground hover:text-foreground">All accounts</Link>}>
          <div className="grid grid-cols-4 gap-2 text-center">
            {[
              ["Total", p.counts.total],
              ["Challenges", p.counts.challenge],
              ["Funded", p.counts.funded],
              ["Failed", p.counts.failed],
            ].map(([label, n]) => (
              <div key={label} className="rounded-md bg-muted/40 py-2">
                <div className="text-lg font-semibold tabular">{n}</div>
                <div className="text-[11px] text-muted-foreground">{label}</div>
              </div>
            ))}
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Active capital</dt>
            <dd className="text-right tabular">{formatMoney(p.totalCapital, ccy, { dp: 0 })}</dd>
            <dt className="text-muted-foreground">Combined equity</dt>
            <dd className="text-right tabular">{formatMoney(p.combinedEquity, ccy)}</dd>
            <dt className="text-muted-foreground">Trading P&amp;L</dt>
            <dd className="text-right"><Pnl value={p.tradingPnl} currency={ccy} /></dd>
            <dt className="text-muted-foreground">Total fees</dt>
            <dd className="text-right tabular text-loss">{formatMoney(-p.totalFees, ccy)}</dd>
            <dt className="text-muted-foreground">Total payouts</dt>
            <dd className="text-right"><Pnl value={p.totalPayouts} currency={ccy} /></dd>
            <dt className="border-t pt-2 font-medium">Net cash flow</dt>
            <dd className="border-t pt-2 text-right font-semibold"><Pnl value={p.netCashFlow} currency={ccy} /></dd>
            <dt className="text-muted-foreground">Return on fees</dt>
            <dd className="text-right tabular">{p.roiPct === null ? "—" : formatPct(p.roiPct, { sign: true })}</dd>
          </dl>
          <p className="mt-3 text-[11px] text-muted-foreground">Cash view: only fees paid and payouts received are money in or out. Account balances are not cash.</p>
          {p.missingCurrencies.length > 0 && <p className="mt-1 text-[11px] text-warning">Missing exchange rate for {p.missingCurrencies.join(", ")}.</p>}
        </Section>
      </div>

      <Section title="Accounts" description={`${active.length} active`} actions={<Link href="/accounts" className="text-xs text-muted-foreground hover:text-foreground">Manage</Link>}>
        {active.length ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {active.map((a) => (
              <AccountCard key={a.id} a={a} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No active accounts.</p>
        )}
      </Section>

      <div className="grid gap-5 xl:grid-cols-5">
        <Section title="Recent trades" className="xl:col-span-3" actions={<Link href="/trades" className="text-xs text-muted-foreground hover:text-foreground">All trades</Link>}>
          {d.recentTrades.length ? (
            <div className="-mx-4 -my-4 divide-y">
              {d.recentTrades.map((t) => (
                <Link key={t.id} href={`/trades/${t.id}`} className="flex items-center gap-3 px-4 py-2 text-sm hover:bg-muted/40">
                  <span className={t.direction === "LONG" ? "w-10 text-xs text-profit" : "w-10 text-xs text-loss"}>{t.direction === "LONG" ? "Long" : "Short"}</span>
                  <span className="w-20 font-medium">{t.symbol}</span>
                  <span className="hidden min-w-0 flex-1 truncate text-muted-foreground sm:block">
                    {t.account}
                    {t.copied && <Badge variant="outline" className="ml-1.5 text-[10px]">copy</Badge>}
                    {t.strategy && <> · {t.strategy}</>}
                  </span>
                  <span className="ml-auto text-xs text-muted-foreground tabular">{formatDateTime(t.closedAt ?? t.openedAt, d.prefs.timezone)}</span>
                  <span className="w-16 text-right"><RValue value={t.rMultiple} /></span>
                  <span className="w-24 text-right">{t.status === "OPEN" ? <Badge variant="secondary">Open</Badge> : <Pnl value={t.netPnl} currency={t.currency} />}</span>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No trades yet.</p>
          )}
        </Section>
        <Section title={formatMonthKey(d.calendar.month)} className="xl:col-span-2" actions={<Link href="/calendar" className="text-xs text-muted-foreground hover:text-foreground">Calendar</Link>}>
          <MonthGrid month={d.calendar.month} days={d.calendar.days} currency={ccy} compact today={d.today} hrefFor={(day) => `/calendar?month=${day.slice(0, 7)}&day=${day}`} />
        </Section>
      </div>

      <div className="grid gap-5 xl:grid-cols-5">
        <Section title="Performance breakdown" className="xl:col-span-3" actions={<Link href="/analytics" className="text-xs text-muted-foreground hover:text-foreground">Analytics</Link>}>
          <Tabs defaultValue="strategy">
            <TabsList>
              <TabsTrigger value="strategy">Strategy</TabsTrigger>
              <TabsTrigger value="symbol">Instrument</TabsTrigger>
              <TabsTrigger value="session">Session</TabsTrigger>
            </TabsList>
            <TabsContent value="strategy"><GroupTable rows={d.analytics.groups.strategy} currency={ccy} label="Strategy" columns={["trades", "winRate", "netPnl", "averageR", "profitFactor"]} /></TabsContent>
            <TabsContent value="symbol"><GroupTable rows={d.analytics.groups.symbol} currency={ccy} label="Instrument" columns={["trades", "winRate", "netPnl", "averageR", "profitFactor"]} /></TabsContent>
            <TabsContent value="session"><GroupTable rows={d.analytics.groups.session} currency={ccy} label="Session" columns={["trades", "winRate", "netPnl", "averageR", "profitFactor"]} /></TabsContent>
          </Tabs>
        </Section>
        <div className="flex flex-col gap-5 xl:col-span-2">
          <Section title="Discipline" description="Most recent rule violations" actions={<Link href="/risk" className="text-xs text-muted-foreground hover:text-foreground">Risk</Link>}>
            {d.violations.length ? (
              <ul className="-my-1 flex flex-col divide-y text-sm">
                {d.violations.map((v) => (
                  <li key={v.id} className="flex items-start gap-2 py-2">
                    <ShieldAlert className={v.severity === "BREACH" ? "mt-0.5 size-4 shrink-0 text-loss" : "mt-0.5 size-4 shrink-0 text-warning"} aria-label={v.severity === "BREACH" ? "Breach" : "Warning"} />
                    <div className="min-w-0">
                      <div>{v.message}</div>
                      <div className="text-xs text-muted-foreground">
                        {v.day} · <Link href={`/accounts/${v.account.id}`} className="hover:underline">{v.account.name}</Link> · {v.source === "PROP_RULE" ? "Prop rule" : "Your rule"}
                        {v.tradeId && <> · <Link href={`/trades/${v.tradeId}`} className="hover:underline">trade</Link></>}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No violations recorded.</p>
            )}
          </Section>
          <Section title="Patterns in your data">
            {d.insights.length ? (
              <ul className="flex flex-col gap-2 text-sm">
                {d.insights.map((i) => (
                  <li key={i.id} className="flex gap-2">
                    <Lightbulb className={i.tone === "negative" ? "mt-0.5 size-4 shrink-0 text-loss" : i.tone === "positive" ? "mt-0.5 size-4 shrink-0 text-profit" : "mt-0.5 size-4 shrink-0 text-muted-foreground"} />
                    <span>
                      {i.text} <span className="text-xs text-muted-foreground">(n = {i.sample})</span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                Insights appear once at least {d.prefs.insightMinTrades} closed trades back them ({d.behaviorSample} so far in this range).
              </p>
            )}
            <Link href="/risk" className="mt-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
              Behaviour analysis <ArrowRight className="size-3" />
            </Link>
          </Section>
        </div>
      </div>
    </div>
  );
}
