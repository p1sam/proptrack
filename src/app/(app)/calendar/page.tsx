import Link from "next/link";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { requireUser } from "@/server/session";
import { getCalendarPage, type CalendarPageData } from "@/server/queries/calendar-page";
import { parseTradeFilters } from "@/lib/filters";
import { formatDayKey, formatMonthKey, formatPct, formatRatio, formatTime } from "@/lib/format";
import { PageHeader, Section } from "@/components/app/page-header";
import { StatCard, StatGrid } from "@/components/app/stat-card";
import { Pnl, RValue } from "@/components/app/pnl";
import { FilterBar } from "@/components/filters/filter-bar";
import { DatasetNotesBar } from "@/components/analytics/dataset-notes";
import { MonthGrid } from "@/components/calendar/month-grid";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export const metadata = { title: "Calendar" };

type SP = Record<string, string | string[] | undefined>;

/** Link within the calendar that keeps every filter param and replaces the calendar ones. */
function calHref(sp: SP, set: { month?: string; day?: string | null; view?: string | null }) {
  const out = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (v === undefined || ["month", "day", "view", "range", "from", "to"].includes(k)) continue;
    if (Array.isArray(v)) v.forEach((x) => out.append(k, x));
    else out.set(k, v);
  }
  if (set.view) out.set("view", set.view);
  if (set.month) out.set("month", set.month);
  if (set.day) out.set("day", set.day);
  return `/calendar${out.size ? `?${out}` : ""}`;
}

export default async function CalendarPage(props: PageProps<"/calendar">) {
  const user = await requireUser();
  const sp = await props.searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const filters = parseTradeFilters(sp);
  const view = str("view") === "year" ? "year" : "month";
  const d = await getCalendarPage(user.id, filters, { month: str("month"), day: str("day") });
  const ccy = d.notes.currency;
  const isYear = view === "year";
  const step = (dir: -1 | 1) => (isYear ? `${d.year + dir}-${d.month.slice(5)}` : dir < 0 ? d.prevMonth : d.nextMonth);
  const v = isYear ? "year" : null;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={isYear ? String(d.year) : formatDayKey(`${d.month}-01`, { month: "long", year: "numeric" })}
        description={`Daily results by close day in ${d.notes.timezone}.`}
        actions={
          <>
            <div className="inline-flex h-8 items-center rounded-lg bg-muted p-[3px] text-sm text-muted-foreground" role="group" aria-label="Calendar view">
              {(["month", "year"] as const).map((x) => (
                <Link
                  key={x}
                  href={calHref(sp, { month: d.month, view: x === "year" ? "year" : null })}
                  aria-current={view === x ? "page" : undefined}
                  className={cn("inline-flex h-full items-center rounded-md px-3 font-medium hover:text-foreground", view === x && "bg-background text-foreground shadow-sm dark:bg-input/30")}
                >
                  {x === "month" ? "Month" : "Year"}
                </Link>
              ))}
            </div>
            <Button variant="outline" size="icon-sm" asChild>
              <Link href={calHref(sp, { month: step(-1), view: v })} aria-label={isYear ? "Previous year" : "Previous month"} scroll={false}>
                <ChevronLeft />
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href={calHref(sp, { month: d.today.slice(0, 7), view: v })} scroll={false}>Today</Link>
            </Button>
            <Button variant="outline" size="icon-sm" asChild>
              <Link href={calHref(sp, { month: step(1), view: v })} aria-label={isYear ? "Next year" : "Next month"} scroll={false}>
                <ChevronRight />
              </Link>
            </Button>
          </>
        }
      />
      <FilterBar options={d.filterOptions} showRange={false} />
      <DatasetNotesBar notes={{ ...d.notes, trades: isYear ? d.notes.trades : d.monthStats.totalTrades }} extra={<span>{isYear ? `in ${d.year}` : `in ${formatMonthKey(d.month)}`}</span>} />
      {isYear ? <YearView d={d} sp={sp} ccy={ccy} /> : <MonthView d={d} sp={sp} ccy={ccy} />}
    </div>
  );
}

type P = { d: CalendarPageData; sp: SP; ccy: string };

function Summary({ s, stats, ccy, period }: { s: CalendarPageData["summary"]; stats: CalendarPageData["monthStats"]; ccy: string; period: string }) {
  return (
    <StatGrid>
      <StatCard label={`Net P&L · ${period}`} value={<Pnl value={s.netPnl} currency={ccy} />} />
      <StatCard label="Winning days" value={s.winningDays} sub={`of ${s.winningDays + s.losingDays} non-flat days`} />
      <StatCard label="Losing days" value={s.losingDays} />
      <StatCard label="Best day" value={<Pnl value={s.bestDay?.pnl} currency={ccy} />} sub={s.bestDay ? formatDayKey(s.bestDay.day) : undefined} />
      <StatCard label="Worst day" value={<Pnl value={s.worstDay?.pnl} currency={ccy} />} sub={s.worstDay ? formatDayKey(s.worstDay.day) : undefined} />
      <StatCard label="Average day" value={<Pnl value={s.averageDay} currency={ccy} />} hint="Net P&L ÷ days with at least one closed trade." />
      <StatCard label="Total trades" value={s.totalTrades} sub={`${stats.wins} W · ${stats.losses} L · ${stats.breakevens} BE`} />
      <StatCard label="Win rate" value={formatPct(stats.winRate)} sub={`PF ${stats.profitFactor === null ? (stats.wins > 0 ? "∞" : "—") : formatRatio(stats.profitFactor)}`} hint="Trade win rate: wins ÷ (wins + losses)." />
    </StatGrid>
  );
}

function MonthView({ d, sp, ccy }: P) {
  return (
    <>
      <Summary s={d.summary} stats={d.monthStats} ccy={ccy} period={formatMonthKey(d.month)} />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Section title="Month" description="Shade scales with the size of the day's P&L; weekly totals on the right. Click a day for its trades.">
          <div className="overflow-x-auto">
            <div className="min-w-[640px]">
              <MonthGrid month={d.month} days={d.days} currency={ccy} large today={d.today} selected={d.day?.day ?? null} weekTotals={d.weeks} hrefFor={(day) => calHref(sp, { month: d.month, day })} />
            </div>
          </div>
        </Section>
        <DayPanel d={d} sp={sp} ccy={ccy} />
      </div>
      <Section title={`${d.year} by month`} description="Click a month to open it">
        <MonthStrip d={d} sp={sp} ccy={ccy} />
      </Section>
    </>
  );
}

function DayPanel({ d, sp, ccy }: P) {
  if (!d.day) {
    return (
      <Section title="Day details">
        <p className="text-sm text-muted-foreground">Select a day with trades to see its trades and stats.</p>
      </Section>
    );
  }
  const s = d.day.stats;
  return (
    <Section
      title={formatDayKey(d.day.day, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
      description={`${s.totalTrades} trade${s.totalTrades === 1 ? "" : "s"} closed`}
      actions={
        <Button variant="ghost" size="icon-sm" asChild>
          <Link href={calHref(sp, { month: d.month })} aria-label="Close day details" scroll={false}>
            <X />
          </Link>
        </Button>
      }
    >
      {s.totalTrades === 0 ? (
        <p className="text-sm text-muted-foreground">No closed trades on this day for the current filters.</p>
      ) : (
        <div className="flex flex-col gap-4">
          <dl className="grid grid-cols-3 gap-x-3 gap-y-2 text-sm">
            <div><dt className="text-xs text-muted-foreground">Net P&amp;L</dt><dd className="font-semibold"><Pnl value={s.netProfit} currency={ccy} /></dd></div>
            <div><dt className="text-xs text-muted-foreground">Win rate</dt><dd className="tabular">{formatPct(s.winRate)}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Total R</dt><dd><RValue value={s.totalR} /></dd></div>
            <div><dt className="text-xs text-muted-foreground">W / L / BE</dt><dd className="tabular">{s.wins} / {s.losses} / {s.breakevens}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Best</dt><dd><Pnl value={s.bestTrade?.netPnl} currency={ccy} /></dd></div>
            <div><dt className="text-xs text-muted-foreground">Worst</dt><dd><Pnl value={s.worstTrade?.netPnl} currency={ccy} /></dd></div>
            <div><dt className="text-xs text-muted-foreground">Gross profit</dt><dd><Pnl value={s.grossProfit} currency={ccy} /></dd></div>
            <div><dt className="text-xs text-muted-foreground">Gross loss</dt><dd><Pnl value={-s.grossLoss} currency={ccy} /></dd></div>
            <div><dt className="text-xs text-muted-foreground">Costs</dt><dd><Pnl value={-s.totalCommission} currency={ccy} /></dd></div>
          </dl>
          <ul className="-mx-4 divide-y border-t" aria-label="Trades on this day">
            {d.day.trades.map((t) => (
              <li key={t.id}>
                <Link href={`/trades/${t.id}`} className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-muted/40">
                  <span className="w-11 text-xs text-muted-foreground tabular" title={`Opened ${formatTime(t.openedAt, d.notes.timezone)}`}>{formatTime(t.closedAt, d.notes.timezone)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{t.symbol}</span> <span className="text-xs text-muted-foreground">{t.direction === "LONG" ? "Long" : "Short"}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {t.accountName}
                      {t.copies > 1 && <Badge variant="outline" className="ml-1 text-[10px]">{t.copies} copies</Badge>}
                      {t.strategyName && <> · {t.strategyName}</>}
                    </span>
                  </span>
                  <span className="w-14 text-right"><RValue value={t.rMultiple} /></span>
                  <span className="w-20 text-right"><Pnl value={t.netPnl} currency={ccy} /></span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Section>
  );
}

function MonthStrip({ d, sp, ccy }: P) {
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-12">
      {d.months.map((m) => (
        <Link
          key={m.month}
          href={calHref(sp, { month: m.month })}
          aria-current={m.month === d.month ? "true" : undefined}
          className={cn("rounded-md border bg-muted/30 px-2 py-1.5 text-xs hover:border-foreground/20", m.month === d.month && "border-primary ring-1 ring-primary")}
        >
          <div className="text-muted-foreground">{formatDayKey(`${m.month}-01`, { month: "short" })}</div>
          <div className="font-medium">{m.trades ? <Pnl value={m.pnl} currency={ccy} compact dp={0} /> : <span className="text-muted-foreground">—</span>}</div>
          <div className="text-[10px] text-muted-foreground tabular">{m.trades} trades</div>
        </Link>
      ))}
    </div>
  );
}

function YearView({ d, sp, ccy }: P) {
  return (
    <>
      <Summary s={d.yearSummary} stats={d.yearStats} ccy={ccy} period={String(d.year)} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {d.months.map((m) => (
          <Section
            key={m.month}
            title={<Link href={calHref(sp, { month: m.month })} className="hover:underline">{formatDayKey(`${m.month}-01`, { month: "long" })}</Link>}
            actions={m.trades ? <span className="text-xs"><Pnl value={m.pnl} currency={ccy} /> · <span className="text-muted-foreground">{m.trades} trades</span></span> : undefined}
          >
            <MonthGrid month={m.month} days={d.yearDays.filter((x) => x.day.startsWith(m.month))} currency={ccy} compact today={d.today} hrefFor={(day) => calHref(sp, { month: m.month, day })} />
          </Section>
        ))}
      </div>
    </>
  );
}
