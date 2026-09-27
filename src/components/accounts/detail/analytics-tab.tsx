import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { loadDataset } from "@/server/queries/dataset";
import { computeAnalytics } from "@/server/queries/analytics";
import { parseTradeFilters } from "@/lib/filters";
import { formatPct, formatRatio } from "@/lib/format";
import { Section } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { Pnl, RValue } from "@/components/app/pnl";
import { EmptyState } from "@/components/app/empty-state";
import { PerformanceChart } from "@/components/charts/performance-chart";
import { GroupTable } from "@/components/analytics/group-table";

export async function AnalyticsTab({ userId, accountId, accountCurrency }: { userId: string; accountId: string; accountCurrency: string }) {
  const ds = await loadDataset(userId, parseTradeFilters({ accounts: accountId }));
  if (!ds.trades.length) {
    return (
      <EmptyState
        title="No closed trades to analyse"
        description={ds.excluded.count ? `${ds.excluded.count} trades in ${ds.excluded.currencies.join(", ")} need an exchange rate to ${ds.currency} (Settings).` : "Analytics appear once this account has closed trades."}
      />
    );
  }
  const an = computeAnalytics(ds);
  const ccy = ds.currency;
  const cols = ["trades", "winRate", "netPnl", "averageR", "profitFactor", "expectancy"] as const;
  return (
    <div className="flex flex-col gap-5">
      {ccy !== accountCurrency && <p className="text-xs text-muted-foreground">Figures in {ccy}, converted from {accountCurrency} with your Settings rates.</p>}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Net P&L" value={<Pnl value={an.stats.netProfit} currency={ccy} />} sub={`${an.stats.totalTrades} trades`} />
        <StatCard label="Win rate" value={formatPct(an.stats.winRate)} sub={`${an.stats.wins}W / ${an.stats.losses}L`} />
        <StatCard label="Profit factor" value={an.stats.profitFactor === null ? "—" : formatRatio(an.stats.profitFactor)} />
        <StatCard label="Avg R" value={<RValue value={an.stats.averageR} />} sub={`n = ${an.stats.tradesWithR}`} />
        <StatCard label="Sharpe (annualised)" value={an.ratios.sharpe === null ? "—" : formatRatio(an.ratios.sharpe)} sub={an.ratios.sharpe === null ? `Needs 20+ days (${an.ratios.days})` : `${an.ratios.days} days`} hint="From daily returns on running capital, annualised over 252 days." />
        <StatCard label="Winning days" value={`${an.daySummary.winningDays} / ${an.daySummary.winningDays + an.daySummary.losingDays}`} sub={`${an.daySummary.losingDays} losing`} />
      </div>
      <Section
        title="Performance"
        description="Balance, drawdown and daily P&L of this account's closed trades"
        actions={
          <Link href={`/analytics?accounts=${accountId}`} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            Full analytics <ArrowRight className="size-3" aria-hidden />
          </Link>
        }
      >
        <PerformanceChart equity={an.equity} daily={an.daily} currency={ccy} startingCapital={ds.startingCapital} showBalance />
      </Section>
      <div className="grid gap-5 xl:grid-cols-3">
        <Section title="By strategy">
          <GroupTable rows={an.groups.strategy} currency={ccy} label="Strategy" columns={[...cols]} />
        </Section>
        <Section title="By instrument">
          <GroupTable rows={an.groups.symbol} currency={ccy} label="Instrument" columns={[...cols]} />
        </Section>
        <Section title="By session">
          <GroupTable rows={an.groups.session} currency={ccy} label="Session" columns={[...cols]} />
        </Section>
      </div>
    </div>
  );
}
