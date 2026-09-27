import { requireUser } from "@/server/session";
import { getStrategiesPage, MAX_COMPARE, type StrategiesPageData } from "@/server/queries/strategy-page";
import { filtersToSearchParams, parseTradeFilters } from "@/lib/filters";
import { formatMoney, formatPct, formatRatio } from "@/lib/format";
import { PageHeader, Section } from "@/components/app/page-header";
import { Pnl, RValue } from "@/components/app/pnl";
import { FilterBar } from "@/components/filters/filter-bar";
import { DatasetNotesBar } from "@/components/analytics/dataset-notes";
import { StrategyTable } from "@/components/analytics/strategy-table";
import { CompareChart } from "@/components/charts/compare-chart";
import { SERIES_COLORS } from "@/components/charts/palette";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const metadata = { title: "Strategies" };

export default async function StrategiesPage(props: PageProps<"/strategies">) {
  const user = await requireUser();
  const sp = await props.searchParams;
  const filters = { ...parseTradeFilters(sp), strategies: [] };
  const compare = (typeof sp.compare === "string" ? sp.compare : "").split(",").filter(Boolean);
  const d = await getStrategiesPage(user.id, filters, compare);
  const ccy = d.notes.currency;
  const q = filtersToSearchParams(filters).toString();

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Strategies" description="Every strategy side by side, from the filtered set of closed trades. Select up to four to compare." />
      <FilterBar options={d.filterOptions} hide={["strategies"]} />
      <DatasetNotesBar notes={d.notes} />
      <Section title="All strategies" description={`${d.rows.length} strategies incl. trades without one · sorted by name, click a column to sort`}>
        <div className="-mx-4 -my-4">
          <StrategyTable rows={d.rows} currency={ccy} max={MAX_COMPARE} query={q ? `?${q}` : ""} />
        </div>
      </Section>
      {d.compare.series.length > 0 ? (
        <Comparison c={d.compare} ccy={ccy} />
      ) : (
        <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">Tick strategies in the table to overlay their cumulative P&amp;L and compare their metrics.</p>
      )}
    </div>
  );
}

function Comparison({ c, ccy }: { c: StrategiesPageData["compare"]; ccy: string }) {
  const pf = (s: (typeof c.stats)[number]["stats"]) => (s.profitFactor === null ? (s.wins > 0 ? "∞" : "—") : formatRatio(s.profitFactor));
  const metrics: { label: string; cell: (s: (typeof c.stats)[number]["stats"]) => React.ReactNode }[] = [
    { label: "Trades", cell: (s) => s.totalTrades },
    { label: "Win rate", cell: (s) => formatPct(s.winRate) },
    { label: "Net P&L", cell: (s) => <Pnl value={s.netProfit} currency={ccy} /> },
    { label: "Profit factor", cell: pf },
    { label: "Expectancy", cell: (s) => <Pnl value={s.expectancy} currency={ccy} /> },
    { label: "Average winner", cell: (s) => <Pnl value={s.averageWinner} currency={ccy} /> },
    { label: "Average loser", cell: (s) => <Pnl value={s.averageLoser} currency={ccy} /> },
    { label: "Payoff ratio", cell: (s) => formatRatio(s.payoffRatio) },
    { label: "Average R", cell: (s) => <><RValue value={s.averageR} /> <span className="text-xs text-muted-foreground">({s.tradesWithR}/{s.totalTrades})</span></> },
    { label: "Total R", cell: (s) => <RValue value={s.totalR} /> },
    { label: "Max drawdown", cell: (s) => (s.maxDrawdown ? formatMoney(-s.maxDrawdown, ccy) : "—") },
    { label: "Recovery factor", cell: (s) => formatRatio(s.recoveryFactor) },
    { label: "Best trade", cell: (s) => <Pnl value={s.bestTrade?.netPnl} currency={ccy} /> },
    { label: "Worst trade", cell: (s) => <Pnl value={s.worstTrade?.netPnl} currency={ccy} /> },
    { label: "Max consecutive losses", cell: (s) => s.maxConsecutiveLosses },
  ];
  return (
    <div className="grid gap-5 xl:grid-cols-5">
      <Section title="Cumulative P&L" description="Per close day; a strategy stays flat on days it did not trade" className="xl:col-span-3">
        <CompareChart series={c.series} money={c.money} r={c.r} currency={ccy} />
      </Section>
      <Section title="Metrics side by side" className="xl:col-span-2">
        <div className="-mx-4 -my-4">
          <Table>
            <caption className="sr-only">Selected strategies compared</caption>
            <TableHeader>
              <TableRow>
                <TableHead>Metric</TableHead>
                {c.stats.map((s, i) => (
                  <TableHead key={s.key} className="text-right">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-0.5 w-3 rounded-full" style={{ background: SERIES_COLORS[i] }} aria-hidden />
                      <span className="text-foreground">{s.label}</span>
                    </span>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {metrics.map((m) => (
                <TableRow key={m.label}>
                  <TableCell className="text-muted-foreground">{m.label}</TableCell>
                  {c.stats.map((s) => (
                    <TableCell key={s.key} className="text-right tabular">
                      {m.cell(s.stats)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Section>
    </div>
  );
}
