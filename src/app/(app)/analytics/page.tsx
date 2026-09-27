import Link from "next/link";
import { BarChart3 } from "lucide-react";
import { requireUser } from "@/server/session";
import { getAnalyticsPage, type AnalyticsPageData, type TradeRef } from "@/server/queries/analytics-page";
import { parseTradeFilters } from "@/lib/filters";
import type { GroupStats } from "@/lib/calc/stats";
import { mean, percentOf } from "@/lib/calc/money";
import { formatDayKey, formatMoney, formatMonthKey, formatPct, formatR, formatRatio } from "@/lib/format";
import { PageHeader, Section } from "@/components/app/page-header";
import { StatCard, StatGrid } from "@/components/app/stat-card";
import { Pnl, RValue } from "@/components/app/pnl";
import { EmptyState } from "@/components/app/empty-state";
import { FilterBar } from "@/components/filters/filter-bar";
import { PerformanceChart } from "@/components/charts/performance-chart";
import { BarBreakdown } from "@/components/charts/bar-breakdown";
import { ColumnChart, type ColumnDatum } from "@/components/charts/column-chart";
import { ChartTableToggle } from "@/components/charts/chart-table-toggle";
import { GroupTable } from "@/components/analytics/group-table";
import { SectionTabs } from "@/components/analytics/section-tabs";
import { DatasetNotesBar } from "@/components/analytics/dataset-notes";
import { BucketTable } from "@/components/analytics/bucket-table";
import { Badge } from "@/components/ui/badge";

export const metadata = { title: "Analytics" };

const TABS = [
  { value: "overview", label: "Overview" },
  { value: "breakdown", label: "Breakdown" },
  { value: "distribution", label: "Distribution" },
  { value: "time", label: "Time" },
] as const;
type Tab = (typeof TABS)[number]["value"];

export default async function AnalyticsPage(props: PageProps<"/analytics">) {
  const user = await requireUser();
  const sp = await props.searchParams;
  const filters = parseTradeFilters(sp);
  const tabParam = typeof sp.tab === "string" ? sp.tab : "overview";
  const tab: Tab = (TABS.map((t) => t.value) as string[]).includes(tabParam) ? (tabParam as Tab) : "overview";
  const d = await getAnalyticsPage(user.id, filters);
  const ccy = d.notes.currency;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Analytics" description="Performance statistics computed from the filtered set of closed trades." />
      <FilterBar options={d.filterOptions} />
      <DatasetNotesBar notes={d.notes} />
      {d.notes.trades === 0 ? (
        <EmptyState icon={<BarChart3 />} title="No closed trades match these filters" description="Widen the date range or clear filters to see analytics." />
      ) : (
        <>
          <SectionTabs tabs={[...TABS]} active={tab} searchParams={sp} pathname="/analytics" />
          {tab === "overview" && <Overview d={d} ccy={ccy} />}
          {tab === "breakdown" && <Breakdown d={d} ccy={ccy} />}
          {tab === "distribution" && <Distribution d={d} ccy={ccy} />}
          {tab === "time" && <TimeTab d={d} ccy={ccy} />}
        </>
      )}
    </div>
  );
}

type P = { d: AnalyticsPageData; ccy: string };

function TradeLink({ t, ccy }: { t: TradeRef | null; ccy: string }) {
  if (!t) return <>—</>;
  return (
    <Link href={`/trades/${t.id}`} className="hover:underline">
      <Pnl value={t.netPnl} currency={ccy} />
    </Link>
  );
}

function tradeSub(t: TradeRef | null) {
  if (!t) return undefined;
  return (
    <Link href={`/trades/${t.id}`} className="hover:underline">
      {t.symbol} · {formatDayKey(t.closeDay, { month: "short", day: "numeric", year: "numeric" })}
    </Link>
  );
}

function streakText(s: AnalyticsPageData["stats"]["currentStreak"]) {
  if (!s.type || !s.count) return "—";
  const word = s.type === "WIN" ? "win" : s.type === "LOSS" ? "loss" : "break-even";
  return `${s.count} ${word}${s.count === 1 ? "" : s.type === "LOSS" ? "es" : "s"}`;
}

function Overview({ d, ccy }: P) {
  const s = d.stats;
  const r = d.ratios;
  const ratioHint = (name: string, def: string) => `${name}: ${def} Annualised with √252 on daily returns (day P&L ÷ capital at the start of the day, trading days only). Shown only with at least 20 trading days — fewer is noise.`;
  const ratioValue = (v: number | null) => (v !== null ? formatRatio(v) : <span className="text-sm font-normal text-muted-foreground">{d.notes.startingCapital <= 0 ? "Needs starting capital" : r.days < 20 ? "Needs ≥20 trading days" : "—"}</span>);
  const ratioSub = r.days < 20 ? `${r.days} trading day${r.days === 1 ? "" : "s"} so far` : `${r.days} trading days`;
  const pf = s.profitFactor === null ? (s.wins > 0 ? "∞" : "—") : formatRatio(s.profitFactor);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">Results</h2>
        <StatGrid>
          <StatCard label="Net profit" value={<Pnl value={s.netProfit} currency={ccy} />} hint="Sum of net P&L (gross − commission + swap) of every trade in the set." />
          <StatCard label="Total trades" value={s.totalTrades} sub={`${s.wins} W · ${s.losses} L · ${s.breakevens} BE`} hint="Closed trades. Copies of one trade across accounts count once unless a single account is selected." />
          <StatCard label="Win rate" value={formatPct(s.winRate)} sub={`Loss rate ${formatPct(s.lossRate)}`} hint="Wins ÷ (wins + losses). Break-even trades are excluded from the denominator." />
          <StatCard label="Profit factor" value={pf} hint="Gross profit ÷ gross loss. ∞ when there are wins and no losses." />
          <StatCard label="Expectancy" value={<Pnl value={s.expectancy} currency={ccy} />} sub={<>R: {formatR(s.averageR)} per trade</>} hint="Average net P&L per trade (= win rate × avg win − loss rate × |avg loss|, break-evens included). R expectancy is the mean R of trades with a defined risk." />
          <StatCard label="Gross profit" value={<Pnl value={s.grossProfit} currency={ccy} />} sub={`${s.wins} winners`} hint="Sum of net P&L of winning trades." />
          <StatCard label="Gross loss" value={<Pnl value={-s.grossLoss} currency={ccy} />} sub={`${s.losses} losers`} hint="Sum of net P&L of losing trades." />
          <StatCard label="Average trade" value={<Pnl value={s.averageTrade} currency={ccy} />} hint="Net profit ÷ total trades." />
        </StatGrid>
      </div>
      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">Per trade</h2>
        <StatGrid>
          <StatCard label="Average winner" value={<Pnl value={s.averageWinner} currency={ccy} />} />
          <StatCard label="Average loser" value={<Pnl value={s.averageLoser} currency={ccy} />} />
          <StatCard label="Payoff ratio" value={formatRatio(s.payoffRatio)} hint="Average winner ÷ |average loser|." />
          <StatCard label="Average R" value={<RValue value={s.averageR} />} sub={`${s.tradesWithR} of ${s.totalTrades} trades have defined risk`} hint="Mean R multiple (net P&L ÷ initial risk). Trades without a valid stop or risk have no R and are left out." />
          <StatCard label="Total R" value={<RValue value={s.totalR} />} sub={`${s.tradesWithR} trades with R`} />
          <StatCard label="Best trade" value={<TradeLink t={d.best} ccy={ccy} />} sub={tradeSub(d.best)} />
          <StatCard label="Worst trade" value={<TradeLink t={d.worst} ccy={ccy} />} sub={tradeSub(d.worst)} />
          <StatCard label="Costs" value={<Pnl value={-s.totalCommission} currency={ccy} />} sub={<>Swap <Pnl value={s.totalSwap} currency={ccy} /></>} hint="Commission total (a cost) and signed swap total. Both are already included in net P&L." />
        </StatGrid>
      </div>
      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">Risk &amp; streaks</h2>
        <StatGrid>
          <StatCard
            label="Max drawdown"
            value={s.maxDrawdown ? formatMoney(-s.maxDrawdown, ccy) : formatMoney(0, ccy)}
            tone={s.maxDrawdown ? "loss" : undefined}
            sub={s.maxDrawdownPct !== null ? formatPct(-s.maxDrawdownPct) : "% needs starting capital"}
            hint="Largest peak-to-trough decline of the closed-trade equity curve. % is relative to the peak, starting from the combined starting balance of the accounts in the set."
          />
          <StatCard label="Current drawdown" value={s.currentDrawdown ? formatMoney(-s.currentDrawdown, ccy) : formatMoney(0, ccy)} tone={s.currentDrawdown ? "loss" : undefined} hint="Distance of the last point below the running peak." />
          <StatCard label="Recovery factor" value={formatRatio(s.recoveryFactor)} hint="Net profit ÷ max drawdown. Needs a drawdown to be defined." />
          <StatCard label="Sharpe ratio" value={ratioValue(r.sharpe)} sub={ratioSub} hint={ratioHint("Sharpe", "mean daily return ÷ standard deviation of daily returns.")} />
          <StatCard label="Sortino ratio" value={ratioValue(r.sortino)} sub={ratioSub} hint={ratioHint("Sortino", "mean daily return ÷ downside deviation (only negative days count as risk).")} />
          <StatCard label="Max consecutive wins" value={s.maxConsecutiveWins} hint="Longest run of winning trades. Break-even trades end a streak." />
          <StatCard label="Max consecutive losses" value={s.maxConsecutiveLosses} hint="Longest run of losing trades. Break-even trades end a streak." />
          <StatCard label="Current streak" value={streakText(s.currentStreak)} tone={s.currentStreak.type === "WIN" ? "profit" : s.currentStreak.type === "LOSS" ? "loss" : undefined} />
        </StatGrid>
      </div>

      <Section title="Performance" description={`Equity, drawdown and daily P&L in ${ccy}, % of starting capital, or R`}>
        <ChartTableToggle
          label="Performance"
          chart={<PerformanceChart equity={d.equity} daily={d.daily} currency={ccy} startingCapital={d.notes.startingCapital} height={320} />}
          table={
            <BucketTable
              caption="Daily P&L"
              maxHeight={360}
              columns={[{ label: "Day" }, { label: "Trades" }, { label: "Win rate" }, { label: "P&L" }, { label: "Cumulative" }, { label: "R" }]}
              rows={[...d.daily].reverse().map((x) => ({
                key: x.day,
                cells: [formatDayKey(x.day, { weekday: "short", month: "short", day: "numeric", year: "numeric" }), x.trades, formatPct(x.winRate), <Pnl key="p" value={x.pnl} currency={ccy} />, <Pnl key="c" value={x.cumPnl} currency={ccy} />, <RValue key="r" value={x.rTotal} />],
              }))}
            />
          }
        />
      </Section>

      <Section title="Trading days" description={`${d.daily.length} days with closed trades`}>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3 lg:grid-cols-6">
          <div><dt className="text-xs text-muted-foreground">Winning days</dt><dd className="tabular">{d.daySummary.winningDays}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Losing days</dt><dd className="tabular">{d.daySummary.losingDays}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Average day</dt><dd><Pnl value={d.daySummary.averageDay} currency={ccy} /></dd></div>
          <div><dt className="text-xs text-muted-foreground">Best day</dt><dd><Pnl value={d.daySummary.bestDay?.pnl} currency={ccy} /> <span className="text-xs text-muted-foreground">{d.daySummary.bestDay ? formatDayKey(d.daySummary.bestDay.day) : ""}</span></dd></div>
          <div><dt className="text-xs text-muted-foreground">Worst day</dt><dd><Pnl value={d.daySummary.worstDay?.pnl} currency={ccy} /> <span className="text-xs text-muted-foreground">{d.daySummary.worstDay ? formatDayKey(d.daySummary.worstDay.day) : ""}</span></dd></div>
          <div><dt className="text-xs text-muted-foreground">Trades per day</dt><dd className="tabular">{formatRatio(mean(d.daily.map((x) => x.trades)), 1)}</dd></div>
        </dl>
      </Section>
    </div>
  );
}

function groupColumns(rows: GroupStats[]): ColumnDatum[] {
  return rows.map((r) => ({
    key: r.key,
    label: r.label,
    value: r.netPnl,
    details: [
      { label: "trades", value: String(r.trades) },
      { label: "win rate", value: formatPct(r.winRate) },
      { label: "avg R", value: formatR(r.averageR) },
    ],
  }));
}

function BreakdownSection({ title, description, rows, ccy, label, hrefFor, children, className }: { title: string; description?: string; rows: GroupStats[]; ccy: string; label: string; hrefFor?: (r: GroupStats) => string | null; children?: React.ReactNode; className?: string }) {
  const n = rows.reduce((a, r) => a + r.trades, 0);
  return (
    <Section title={title} description={description ?? `${rows.length} group${rows.length === 1 ? "" : "s"} · ${n} trades`} className={className}>
      <div className="flex flex-col gap-4">
        <BarBreakdown rows={rows} currency={ccy} />
        <GroupTable rows={rows} currency={ccy} label={label} hrefFor={hrefFor} caption={`${title}: performance by ${label.toLowerCase()}`} />
        {children}
      </div>
    </Section>
  );
}

function Breakdown({ d, ccy }: P) {
  const g = d.groups;
  const tagTotal = g.tag.length;
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <BreakdownSection title="By strategy" rows={g.strategy} ccy={ccy} label="Strategy" hrefFor={(r) => `/strategies/${r.key === "__none__" ? "none" : r.key}`} />
      <BreakdownSection title="By instrument" rows={g.symbol} ccy={ccy} label="Instrument" />
      <BreakdownSection title="Long vs short" rows={g.direction} ccy={ccy} label="Direction" />
      <BreakdownSection title="By setup" rows={g.setup} ccy={ccy} label="Setup" />
      <BreakdownSection title="By account" rows={g.account} ccy={ccy} label="Account" hrefFor={(r) => (r.key === "__copies__" ? null : `/accounts/${r.key}`)} description="Trades copied across several accounts are grouped together; their P&L is the sum of all copies." />
      <BreakdownSection title="By prop firm" rows={g.firm} ccy={ccy} label="Firm" />
      <BreakdownSection title="By timeframe" rows={g.timeframe} ccy={ccy} label="Timeframe" />
      <BreakdownSection title="By grade" rows={g.grade} ccy={ccy} label="Grade" />
      <Section
        title="Tags — what they cost"
        description={`${tagTotal} tag${tagTotal === 1 ? "" : "s"} · sorted by net P&L, most costly first. A trade with several tags appears under each.`}
        className="xl:col-span-2"
      >
        <div className="flex flex-col gap-4">
          {d.mistakes.tagCount > 0 && (
            <p className="text-sm">
              Trades with at least one mistake tag: <span className="tabular font-medium">{d.mistakes.trades}</span> of {d.stats.totalTrades}, net <Pnl value={d.mistakes.netPnl} currency={ccy} />.
            </p>
          )}
          <div className="grid gap-4 lg:grid-cols-5">
            <div className="lg:col-span-2">
              <BarBreakdown rows={g.tag} currency={ccy} />
            </div>
            <div className="lg:col-span-3">
              <GroupTable
                rows={g.tag}
                currency={ccy}
                label="Tag"
                caption="Performance by tag"
                labelSuffix={(r) =>
                  r.kind === "MISTAKE" ? (
                    <Badge variant="outline" className="ml-1.5 text-[10px]">mistake</Badge>
                  ) : r.kind === "POSITIVE" ? (
                    <Badge variant="outline" className="ml-1.5 text-[10px]">positive</Badge>
                  ) : null
                }
              />
            </div>
          </div>
        </div>
      </Section>
    </div>
  );
}

function Distribution({ d, ccy }: P) {
  const pnl = d.distributions.pnl;
  const r = d.distributions.r;
  const total = d.stats.totalTrades;
  const withR = d.distributions.tradesWithR;
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <Section title="P&L distribution" description={`${total} trades in ${pnl.length} equal-width buckets of net P&L (${ccy})`}>
        <ChartTableToggle
          label="P&L distribution"
          chart={
            <ColumnChart
              kind="count"
              valueLabel="trades"
              height={260}
              data={pnl.map((b) => ({
                key: b.label,
                label: formatMoney((b.from + b.to) / 2, ccy, { sign: true, dp: 0, compact: true }),
                value: b.count,
                tone: b.tone,
                details: [{ label: "range", value: `${formatMoney(b.from, ccy, { dp: 0 })} to ${formatMoney(b.to, ccy, { dp: 0 })}` }, { label: "of trades", value: formatPct(percentOf(b.count, total)) }],
              }))}
            />
          }
          table={
            <BucketTable
              caption="P&L distribution"
              columns={[{ label: "Net P&L range" }, { label: "Trades" }, { label: "Share" }]}
              rows={pnl.map((b) => ({ key: b.label, cells: [`${formatMoney(b.from, ccy, { dp: 0 })} to ${formatMoney(b.to, ccy, { dp: 0 })}`, b.count, formatPct(percentOf(b.count, total))] }))}
            />
          }
        />
        <p className="mt-2 text-xs text-muted-foreground">Bars are coloured by whether the bucket&apos;s midpoint is a gain or a loss; the axis label is the bucket midpoint.</p>
      </Section>
      <Section title="R distribution" description={`${withR} of ${total} trades have a defined risk`}>
        {withR === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No trades with a defined risk (stop loss) in this set.</p>
        ) : (
          <ChartTableToggle
            label="R distribution"
            chart={
              <ColumnChart
                kind="count"
                valueLabel="trades"
                height={260}
                data={r.map((b) => ({ key: b.label, label: b.label, value: b.count, tone: b.tone, details: [{ label: "of trades with R", value: formatPct(percentOf(b.count, withR)) }] }))}
              />
            }
            table={
              <BucketTable
                caption="R distribution"
                columns={[{ label: "R bucket" }, { label: "Trades" }, { label: "Share" }]}
                rows={r.map((b) => ({ key: b.label, cells: [b.label, b.count, formatPct(percentOf(b.count, withR))] }))}
              />
            }
          />
        )}
      </Section>
      <Section title="Wins vs losses" className="xl:col-span-2">
        <BucketTable
          caption="Wins vs losses"
          columns={[{ label: "Outcome" }, { label: "Trades" }, { label: "Share" }, { label: "Total" }, { label: "Average" }]}
          rows={[
            { key: "w", cells: ["Winners", d.stats.wins, formatPct(percentOf(d.stats.wins, total)), <Pnl key="t" value={d.stats.grossProfit} currency={ccy} />, <Pnl key="a" value={d.stats.averageWinner} currency={ccy} />] },
            { key: "l", cells: ["Losers", d.stats.losses, formatPct(percentOf(d.stats.losses, total)), <Pnl key="t" value={-d.stats.grossLoss} currency={ccy} />, <Pnl key="a" value={d.stats.averageLoser} currency={ccy} />] },
            { key: "b", cells: ["Break-even", d.stats.breakevens, formatPct(percentOf(d.stats.breakevens, total)), "—", "—"] },
          ]}
        />
      </Section>
    </div>
  );
}

function TimeTab({ d, ccy }: P) {
  const g = d.groups;
  // Fill untraded hours between the first and last traded hour so the axis is continuous.
  const hourRows: ColumnDatum[] = [];
  if (g.hour.length) {
    const byKey = new Map(groupColumns(g.hour).map((c) => [c.key, c]));
    const first = Number(g.hour[0].key);
    const last = Number(g.hour.at(-1)!.key);
    for (let h = first; h <= last; h++) {
      const k = String(h).padStart(2, "0");
      hourRows.push(byKey.get(k) ?? { key: k, label: `${k}:00`, value: 0, details: [{ label: "trades", value: "0" }] });
    }
  }
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <Section title="Monthly P&L" description={`${d.monthly.length} month${d.monthly.length === 1 ? "" : "s"} · by close day in ${d.notes.timezone}`} className="xl:col-span-2">
        <ChartTableToggle
          label="Monthly P&L"
          chart={
            <ColumnChart
              kind="money"
              currency={ccy}
              valueLabel="net P&L"
              height={260}
              data={d.monthly.map((m) => ({
                key: m.month,
                label: formatMonthKey(m.month),
                value: m.pnl,
                details: [
                  { label: "trades", value: String(m.trades) },
                  { label: "winning days", value: String(m.winningDays) },
                  { label: "losing days", value: String(m.losingDays) },
                ],
              }))}
            />
          }
          table={
            <BucketTable
              caption="Monthly P&L"
              columns={[{ label: "Month" }, { label: "Trades" }, { label: "Winning days" }, { label: "Losing days" }, { label: "Net P&L" }]}
              rows={d.monthly.map((m) => ({ key: m.month, cells: [<Link key="m" href={`/calendar?month=${m.month}`} className="hover:underline">{formatMonthKey(m.month)}</Link>, m.trades, m.winningDays, m.losingDays, <Pnl key="p" value={m.pnl} currency={ccy} />] }))}
            />
          }
        />
      </Section>
      <Section title="By weekday" description={`Weekday of the open, in ${d.notes.timezone}`}>
        <div className="flex flex-col gap-4">
          <ColumnChart kind="money" currency={ccy} valueLabel="net P&L" data={groupColumns(g.weekday)} />
          <GroupTable rows={g.weekday} currency={ccy} label="Weekday" caption="Performance by weekday" />
        </div>
      </Section>
      <Section title="By hour" description={`Hour of the open, in ${d.notes.timezone}`}>
        <div className="flex flex-col gap-4">
          <ColumnChart kind="money" currency={ccy} valueLabel="net P&L" data={hourRows} />
          <GroupTable rows={g.hour} currency={ccy} label="Hour" caption="Performance by hour" />
        </div>
      </Section>
      <BreakdownSection title="By session" rows={g.session} ccy={ccy} label="Session" className="xl:col-span-2" />
    </div>
  );
}
