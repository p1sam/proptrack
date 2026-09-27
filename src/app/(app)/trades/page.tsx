import Link from "next/link";
import { ListOrdered, Plus, Upload } from "lucide-react";
import { requireUser } from "@/server/session";
import { getFilterOptions } from "@/server/queries/options";
import { TRADES_PAGE_SIZE, listTrades, parseTableParams, tradeSetSummary } from "@/server/queries/trades";
import { activeFilterCount, parseTradeFilters } from "@/lib/filters";
import { formatPct, formatR } from "@/lib/format";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { Pnl } from "@/components/app/pnl";
import { EmptyState } from "@/components/app/empty-state";
import { FilterBar } from "@/components/filters/filter-bar";
import { Button } from "@/components/ui/button";
import { TradesTable } from "@/components/trades/trades-table";
import { Pagination } from "@/components/trades/pagination";
import { TradeSearch } from "@/components/trades/trade-search";

export const metadata = { title: "Trades" };

export default async function TradesPage(props: PageProps<"/trades">) {
  const user = await requireUser();
  const sp = await props.searchParams;
  const filters = parseTradeFilters(sp);
  const table = parseTableParams(sp);
  const [options, list, summary] = await Promise.all([getFilterOptions(user.id), listTrades(user.id, filters, table), tradeSetSummary(user.id, filters)]);
  const hasFilters = activeFilterCount(filters) > 0 || (filters.range && filters.range !== "all") || filters.status;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Trades"
        description="Every trade across your accounts."
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/trades/import">
                <Upload /> Import
              </Link>
            </Button>
            <Button asChild>
              <Link href="/trades/new">
                <Plus /> New trade
              </Link>
            </Button>
          </>
        }
      />

      <div className="flex flex-col gap-2">
        <TradeSearch />
        <FilterBar
          showStatus
          options={{
            accounts: options.accounts,
            firms: options.firms,
            strategies: options.strategies,
            symbols: options.symbols,
            sessions: options.sessions,
            setups: options.setups,
            tags: options.tags,
          }}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Trades" value={list.total} sub={filters.status === "ALL" ? "Open and closed" : filters.status === "OPEN" ? "Open" : "Closed"} />
        <StatCard
          label="Net P&L"
          value={<Pnl value={summary.netPnl} currency={summary.currency} />}
          sub={`${summary.rawClosed} closed trades · ${summary.currency}`}
          hint="Closed trades in this filter, converted to your default currency. Every copy counts toward money totals."
        />
        <StatCard label="Win rate" value={formatPct(summary.winRate)} sub={summary.collapsed ? `${summary.closedTrades} ideas (copies counted once)` : `${summary.closedTrades} closed`} hint="Wins ÷ (wins + losses); break-even trades are excluded." />
        <StatCard label="Average R" value={formatR(summary.averageR)} sub={`${summary.tradesWithR} trades with a stop`} hint="Only trades with a valid stop or risk override have an R multiple." />
      </div>
      {summary.excluded.count > 0 && (
        <p className="-mt-2 text-xs text-warning">
          {summary.excluded.count} trades in {summary.excluded.currencies.join(", ")} are excluded from the totals — add an exchange rate in Settings.
        </p>
      )}

      {list.rows.length ? (
        <>
          <TradesTable rows={list.rows} timezone={list.prefs.timezone} sort={table.sort} dir={table.dir} />
          <Pagination path="/trades" params={sp} page={list.page} pages={list.pages} total={list.total} pageSize={TRADES_PAGE_SIZE} />
        </>
      ) : hasFilters ? (
        <EmptyState icon={<ListOrdered />} title="No trades match these filters" description="Try widening the date range or clearing filters." />
      ) : (
        <EmptyState
          icon={<ListOrdered />}
          title="No trades yet"
          description="Log a trade by hand or import a CSV from your platform."
          action={
            <Button asChild>
              <Link href="/trades/new">
                <Plus /> New trade
              </Link>
            </Button>
          }
        />
      )}
    </div>
  );
}
