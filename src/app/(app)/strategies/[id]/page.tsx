import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/server/session";
import { getStrategyDetail } from "@/server/queries/strategy-page";
import { filtersToSearchParams, parseTradeFilters } from "@/lib/filters";
import { formatDateTime, formatMoney, formatPct, formatRatio } from "@/lib/format";
import { PageHeader, Section } from "@/components/app/page-header";
import { StatCard, StatGrid } from "@/components/app/stat-card";
import { Pnl, RValue } from "@/components/app/pnl";
import { FilterBar } from "@/components/filters/filter-bar";
import { DatasetNotesBar } from "@/components/analytics/dataset-notes";
import { GroupTable } from "@/components/analytics/group-table";
import { PerformanceChart } from "@/components/charts/performance-chart";
import { BarBreakdown } from "@/components/charts/bar-breakdown";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export async function generateMetadata(props: PageProps<"/strategies/[id]">) {
  const { id } = await props.params;
  return { title: id === "none" ? "No strategy" : "Strategy" };
}

export default async function StrategyDetailPage(props: PageProps<"/strategies/[id]">) {
  const user = await requireUser();
  const [{ id }, sp] = await Promise.all([props.params, props.searchParams]);
  const filters = { ...parseTradeFilters(sp), strategies: [] };
  const d = await getStrategyDetail(user.id, id, filters);
  const ccy = d.notes.currency;
  const s = d.stats;
  const q = filtersToSearchParams(filters).toString();

  return (
    <div className="flex flex-col gap-5">
      <Link href={`/strategies${q ? `?${q}` : ""}`} className="inline-flex w-fit items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3" /> All strategies
      </Link>
      <PageHeader
        title={
          <span className="inline-flex items-center gap-2">
            {d.strategy.name}
            {d.strategy.isArchived && <Badge variant="outline">archived</Badge>}
          </span>
        }
        description={d.strategy.description ?? undefined}
        actions={
          <Link href={`/analytics?${new URLSearchParams({ ...Object.fromEntries(filtersToSearchParams(filters)), strategies: id })}`} className="text-xs text-muted-foreground hover:text-foreground">
            Full analytics for this strategy
          </Link>
        }
      />
      <FilterBar options={d.filterOptions} hide={["strategies"]} />
      <DatasetNotesBar notes={d.notes} />

      <StatGrid>
        <StatCard label="Net P&L" value={<Pnl value={s.netProfit} currency={ccy} />} />
        <StatCard label="Trades" value={s.totalTrades} sub={`${s.wins} W · ${s.losses} L · ${s.breakevens} BE`} />
        <StatCard label="Win rate" value={formatPct(s.winRate)} hint="Wins ÷ (wins + losses); break-even trades excluded." />
        <StatCard label="Profit factor" value={s.profitFactor === null ? (s.wins > 0 ? "∞" : "—") : formatRatio(s.profitFactor)} hint="Gross profit ÷ gross loss." />
        <StatCard label="Expectancy" value={<Pnl value={s.expectancy} currency={ccy} />} hint="Average net P&L per trade." />
        <StatCard label="Average R" value={<RValue value={s.averageR} />} sub={`${s.tradesWithR} of ${s.totalTrades} with defined risk`} />
        <StatCard label="Max drawdown" value={s.maxDrawdown ? formatMoney(-s.maxDrawdown, ccy) : formatMoney(0, ccy)} tone={s.maxDrawdown ? "loss" : undefined} hint="Largest peak-to-trough decline of this strategy's closed-trade equity." />
        <StatCard label="Best / worst" value={<Pnl value={s.bestTrade?.netPnl} currency={ccy} />} sub={<Pnl value={s.worstTrade?.netPnl} currency={ccy} />} />
      </StatGrid>

      <Section title="Equity curve" description={`${d.strategy.name} only, in ${ccy}`}>
        <PerformanceChart equity={d.equity} daily={d.daily} currency={ccy} startingCapital={d.notes.startingCapital} />
      </Section>

      <div className="grid gap-5 xl:grid-cols-5">
        <Section title="Breakdown" className="xl:col-span-3">
          <Tabs defaultValue="symbol">
            <TabsList>
              <TabsTrigger value="symbol">Instrument</TabsTrigger>
              <TabsTrigger value="session">Session</TabsTrigger>
              <TabsTrigger value="setup">Setup</TabsTrigger>
              <TabsTrigger value="direction">Long / short</TabsTrigger>
            </TabsList>
            {(
              [
                ["symbol", "Instrument", d.groups.symbol],
                ["session", "Session", d.groups.session],
                ["setup", "Setup", d.groups.setup],
                ["direction", "Direction", d.groups.direction],
              ] as const
            ).map(([k, label, rows]) => (
              <TabsContent key={k} value={k} className="flex flex-col gap-4">
                <BarBreakdown rows={rows} currency={ccy} />
                <GroupTable rows={rows} currency={ccy} label={label} caption={`${d.strategy.name} by ${label.toLowerCase()}`} />
              </TabsContent>
            ))}
          </Tabs>
        </Section>
        <Section title="Recent trades" description={`Last ${d.recent.length} closed`} className="xl:col-span-2">
          {d.recent.length ? (
            <div className="-mx-4 -my-4 divide-y">
              {d.recent.map((t) => (
                <Link key={t.id} href={`/trades/${t.id}`} className="flex items-center gap-3 px-4 py-2 text-sm hover:bg-muted/40">
                  <span className="w-10 text-xs text-muted-foreground">{t.direction === "LONG" ? "Long" : "Short"}</span>
                  <span className="w-16 font-medium">{t.symbol}</span>
                  <span className="hidden min-w-0 flex-1 truncate text-xs text-muted-foreground sm:block">{t.accountName}</span>
                  <span className="ml-auto text-xs text-muted-foreground tabular">{formatDateTime(t.closedAt, d.notes.timezone)}</span>
                  <span className="w-14 text-right"><RValue value={t.rMultiple} /></span>
                  <span className="w-24 text-right"><Pnl value={t.netPnl} currency={ccy} /></span>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No closed trades match these filters.</p>
          )}
        </Section>
      </div>
    </div>
  );
}
