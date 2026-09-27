import Link from "next/link";
import { CalendarRange, FileSpreadsheet, Landmark } from "lucide-react";
import { requireUser } from "@/server/session";
import { getFilterOptions } from "@/server/queries/options";
import { getReportsPreview } from "@/server/queries/reports";
import { defaultReportMonth } from "@/server/reports/monthly";
import { isMonthKey } from "@/server/reports/aggregations";
import { parseTradeFilters } from "@/lib/filters";
import { formatMoney, formatMonthKey, formatNumber, formatPct, formatRatio } from "@/lib/format";
import { PageHeader } from "@/components/app/page-header";
import { Pnl, PctValue } from "@/components/app/pnl";
import { FilterBar } from "@/components/filters/filter-bar";
import { DownloadButton } from "@/components/reports/download-button";
import { MonthPicker } from "@/components/reports/month-picker";
import { ReportCard, PreviewStat } from "@/components/reports/report-card";

export const metadata = { title: "Reports" };

export default async function ReportsPage(props: PageProps<"/reports">) {
  const user = await requireUser();
  const sp = await props.searchParams;
  const filters = parseTradeFilters(sp);
  const current = await defaultReportMonth(user.id);
  const rawMonth = typeof sp.month === "string" ? sp.month : undefined;
  const month = isMonthKey(rawMonth) && rawMonth <= current ? rawMonth : current;
  const [options, p] = await Promise.all([getFilterOptions(user.id), getReportsPreview(user.id, filters, month)]);
  const ccy = p.currency;

  // Forward the page's filters to the export routes (minus the page-only month param).
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (k === "month" || v === undefined) continue;
    for (const one of Array.isArray(v) ? v : [v]) qs.append(k, one);
  }
  const href = (path: string, extra: Record<string, string>) => {
    const q = new URLSearchParams(qs);
    for (const [k, v] of Object.entries(extra)) q.set(k, v);
    return `${path}?${q}`;
  };
  const firmQs = new URLSearchParams();
  for (const k of ["accounts", "firms"] as const) if (filters[k].length) firmQs.set(k, filters[k].join(","));
  const firmHref = (format: string) => `/api/export/prop-firms?${new URLSearchParams({ ...Object.fromEntries(firmQs), format })}`;

  const m = p.monthly;
  const f = p.firms;
  const filterOptions = {
    accounts: options.accounts.map((a) => ({ id: a.id, name: a.name })),
    firms: options.firms,
    strategies: options.strategies.map((s) => ({ id: s.id, name: s.name })),
    symbols: options.symbols,
    sessions: options.sessions.map((s) => ({ id: s.id, name: s.name })),
    setups: options.setups,
    tags: options.tags.map((t) => ({ id: t.id, name: t.name })),
  };

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Reports" description="Download your journal as spreadsheets and printable PDF reports. The filters below scope every export." />
      <FilterBar options={filterOptions} showStatus />
      <p className="-mt-2 text-xs text-muted-foreground">
        {p.filterNote ? <>Active filters: {p.filterNote}.</> : "No filters — exports include all your data."} Times are in {p.timezone}; totals in {ccy}.
      </p>

      <div className="grid gap-5 xl:grid-cols-3">
        <ReportCard
          icon={<FileSpreadsheet />}
          title="Trade report"
          description="Every trade matching the filters — one row per account copy, with a Group ID linking copies of the same idea. Includes prices, costs, P&L, risk, R, classification, tags, emotions, plan adherence and notes. The Excel file adds a Summary sheet with closed-trade statistics."
          scope="All filters apply, including date range and status (closed trades by default)."
          preview={
            <>
              <PreviewStat label="Rows" value={formatNumber(p.trades.rows, 0)} />
              <PreviewStat label="Accounts" value={formatNumber(p.trades.accounts, 0)} />
              <PreviewStat label="Copy groups" value={formatNumber(p.trades.groups, 0)} />
              <PreviewStat label="Open trades" value={formatNumber(p.trades.open, 0)} />
            </>
          }
          actions={
            p.trades.rows > 0 ? (
              <>
                <DownloadButton href={href("/api/export/trades", { format: "csv" })} label="CSV" fallbackName="proptrack-trades.csv" />
                <DownloadButton href={href("/api/export/trades", { format: "xlsx" })} label="Excel (.xlsx)" fallbackName="proptrack-trades.xlsx" variant="default" />
              </>
            ) : (
              <p className="text-sm text-muted-foreground">No trades match these filters.</p>
            )
          }
          footnote="Money columns are in each account's own currency; the Summary sheet converts to your default currency. Spreadsheet formula characters at the start of text cells are escaped."
        />

        <ReportCard
          icon={<CalendarRange />}
          title="Monthly performance"
          description="A printable PDF for one month: accounts included, P&L, win rate, profit factor, drawdown and trade count, then strategy, instrument and daily tables and your psychology (emotion averages, followed-plan %, costliest mistake tags)."
          scope="The month replaces the date range; all other filters apply."
          headerExtra={<MonthPicker month={month} max={current} />}
          preview={
            <>
              <PreviewStat label={`Net P&L · ${formatMonthKey(m.month)}`} value={<Pnl value={m.netPnl} currency={ccy} />} />
              <PreviewStat label="Trades" value={`${m.trades} · ${m.tradingDays} days`} />
              <PreviewStat label="Win rate" value={formatPct(m.winRate)} />
              <PreviewStat label="Profit factor" value={m.profitFactor === null ? "—" : formatRatio(m.profitFactor)} />
              <PreviewStat label="Max drawdown" value={formatMoney(m.maxDrawdown ? -Math.abs(m.maxDrawdown) : 0, ccy)} />
              <PreviewStat label="Followed plan" value={formatPct(m.followedPlanPct)} />
              <PreviewStat label="Accounts" value={String(m.accounts)} />
              <PreviewStat label="Costliest mistake" value={m.topMistake ? <span className="truncate">{m.topMistake.label} <Pnl value={m.topMistake.netPnl} currency={ccy} className="text-xs" /></span> : "—"} />
            </>
          }
          actions={<DownloadButton href={href("/api/export/monthly", { month })} label="PDF" fallbackName={`proptrack-monthly-${month}.pdf`} variant="default" />}
          footnote={
            m.excluded.count > 0
              ? `${m.excluded.count} trades in ${m.excluded.currencies.join(", ")} are excluded (no exchange rate) — add one in Settings → Currencies.`
              : m.trades === 0
                ? "No closed trades in this month — the PDF will be mostly empty."
                : "Copies of one idea on several accounts count once for rates; money sums every copy."
          }
        />

        <ReportCard
          icon={<Landmark />}
          title="Prop-firm report"
          description="The cash side of prop trading: fees paid by type, accounts purchased, passed, failed or breached and funded, every payout, net cash flow, ROI on fees and payout multiple — per firm and per account."
          scope="Account and prop-firm filters apply; the report covers each account's whole life (date filters are ignored)."
          preview={
            <>
              <PreviewStat label="Net cash flow" value={<Pnl value={f.netCashFlow} currency={ccy} />} />
              <PreviewStat label="Fees paid" value={formatMoney(f.fees, ccy)} />
              <PreviewStat label="Payouts received" value={formatMoney(f.payouts, ccy)} />
              <PreviewStat label="ROI on fees" value={<PctValue value={f.roiPct} />} />
              <PreviewStat label="Payout multiple" value={f.payoutMultiple === null ? "—" : `${formatRatio(f.payoutMultiple)}×`} />
              <PreviewStat label="Pass rate" value={`${formatPct(f.passRate)}`} sub={`${f.passed} passed / ${f.failed} failed`} />
              <PreviewStat label="Accounts" value={`${f.accounts} · ${f.purchased} purchased`} />
              <PreviewStat label="Funded" value={String(f.funded)} sub={`${f.payoutCount} payouts · ${f.firmCount} firms`} />
            </>
          }
          actions={
            <>
              <DownloadButton href={firmHref("csv")} label="CSV" fallbackName="proptrack-prop-firms.csv" />
              <DownloadButton href={firmHref("pdf")} label="PDF" fallbackName="proptrack-prop-firms.pdf" variant="default" />
            </>
          }
          footnote={
            f.missing.length
              ? `Missing exchange rate for ${f.missing.join(", ")} — those amounts are excluded.`
              : "Pass rate = passed ÷ (passed + failed) over resolved evaluations; challenges in progress are left out. Only payouts marked Paid count as received."
          }
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Numbers come from the same pipeline as the dashboard and analytics. Balances are closed-trade balances; see <Link href="/settings?tab=currencies" className="underline underline-offset-2 hover:text-foreground">Settings → Currencies</Link> for conversion rates.
      </p>
    </div>
  );
}
