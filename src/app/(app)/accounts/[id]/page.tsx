import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ChevronLeft, Info } from "lucide-react";
import { requireUser } from "@/server/session";
import { getAccountDetail } from "@/server/queries/account-detail";
import { getPropFirms } from "@/server/queries/account-list";
import { formatDate, formatMoney, formatPct } from "@/lib/format";
import { ACCOUNT_TYPE_LABEL } from "@/lib/labels";
import { StatCard } from "@/components/app/stat-card";
import { Pnl, PctValue } from "@/components/app/pnl";
import { StatusBadge } from "@/components/app/status-badge";
import { AccountActionsMenu } from "@/components/accounts/account-actions-menu";
import { AccountTabsNav, parseAccountTab } from "@/components/accounts/account-tabs";
import { LimitCard, allowanceStatus } from "@/components/accounts/limit-card";
import { DRAWDOWN_TYPE_LABEL } from "@/components/accounts/rule-labels";
import { OverviewTab } from "@/components/accounts/detail/overview-tab";
import { TradesTab } from "@/components/accounts/detail/trades-tab";
import { AnalyticsTab } from "@/components/accounts/detail/analytics-tab";
import { JournalTab } from "@/components/accounts/detail/journal-tab";
import { RulesTab } from "@/components/accounts/detail/rules-tab";
import { PayoutsTab } from "@/components/accounts/detail/payouts-tab";
import { TimelineTab } from "@/components/accounts/detail/timeline-tab";

export async function generateMetadata(props: PageProps<"/accounts/[id]">) {
  const user = await requireUser();
  const { id } = await props.params;
  const d = await getAccountDetail(user.id, id);
  return { title: d ? d.summary.name : "Account" };
}

export default async function AccountPage(props: PageProps<"/accounts/[id]">) {
  const user = await requireUser();
  const { id } = await props.params;
  const tab = parseAccountTab((await props.searchParams).tab);
  const [detail, firms] = await Promise.all([getAccountDetail(user.id, id), getPropFirms(user.id)]);
  if (!detail) notFound();

  const { summary: a, state: s, prefs } = detail;
  const ccy = a.currency;
  const tz = prefs.timezone;
  const inactive = a.group === "failed" || a.group === "inactive";

  const daily = s.dailyLoss ? allowanceStatus(s.dailyLoss.remainingPct, s.dailyLoss.remaining) : null;
  const overall = s.overallLoss ? allowanceStatus(s.overallLoss.remainingPct, s.overallLoss.remaining) : null;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <Link href="/accounts" className="inline-flex w-fit items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ChevronLeft className="size-3.5" aria-hidden /> Accounts
        </Link>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="text-xs text-muted-foreground">{a.firm?.name ?? "No firm"}</div>
            <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold tracking-tight">
              <span className="min-w-0 break-words">{a.name}</span>
              <StatusBadge status={a.status} />
              {a.passEligible && a.status === "CHALLENGE" && <span className="rounded-md border border-profit/40 bg-profit/10 px-1.5 py-0.5 text-[11px] font-medium text-profit">Pass eligible</span>}
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {a.accountNumber && <>#{a.accountNumber} · </>}
              {formatMoney(a.accountSize, ccy, { dp: 0 })} · {ACCOUNT_TYPE_LABEL[a.accountType]}
              {a.phase ? ` · Phase ${a.phase}` : ""} · {ccy}
              {a.startedAt && <> · started {formatDate(a.startedAt, tz)}</>}
              {a.endedAt && <> · ended {formatDate(a.endedAt, tz)}</>}
            </p>
          </div>
          <AccountActionsMenu
            firms={firms.map((f) => ({ id: f.id, name: f.name, ruleTemplate: f.ruleTemplate as Record<string, unknown> | null }))}
            account={{
              id: a.id,
              name: a.name,
              propFirmId: detail.propFirmId,
              accountNumber: a.accountNumber,
              accountSize: a.accountSize,
              startingBalance: a.startingBalance,
              currency: ccy,
              accountType: a.accountType,
              phase: a.phase,
              purchasedAt: a.purchasedAt,
              startedAt: a.startedAt,
              notes: detail.notes,
              status: a.status,
            }}
          />
        </div>
      </div>

      {s.warnings.length > 0 && !inactive && (
        <div role="alert" className="flex flex-col gap-1 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
          {s.warnings.map((w) => (
            <p key={w} className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
              <span>
                <span className="font-medium">Warning:</span> {w}
              </span>
            </p>
          ))}
        </div>
      )}
      {s.breached && (
        <div role="alert" className="flex items-start gap-2 rounded-lg border border-loss/40 bg-loss/10 px-4 py-3 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-loss" aria-hidden />
          <span>
            <span className="font-medium">Breach recorded:</span> a daily or overall loss limit was crossed on closed-trade balance.{" "}
            <Link href={`/accounts/${a.id}?tab=rules`} className="underline">
              See violations
            </Link>
            {a.status !== "BREACHED" && a.status !== "FAILED" ? " — update the status if the firm closed the account." : ""}
          </span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        <StatCard label="Balance" value={formatMoney(s.balance, ccy)} sub={`Start ${formatMoney(s.startingBalance, ccy)}${s.totalWithdrawn ? ` · withdrawn ${formatMoney(s.totalWithdrawn, ccy)}` : ""}`} />
        <StatCard label="Equity" value={formatMoney(s.equity, ccy)} sub="Closed-trade balance" hint="PropTrack only sees closed trades, so equity equals the closed-trade balance. Floating P&L of open positions is not included." />
        <StatCard label="P&L" value={<Pnl value={s.tradingPnl} currency={ccy} />} sub={<PctValue value={s.pnlPct} />} hint="Net trading P&L (after commission and swap) as % of starting balance. Payout withdrawals are not losses." />
        <StatCard label="Today" value={<Pnl value={s.todayPnl} currency={ccy} />} sub={<>{formatPct(s.todayPnlPct, { sign: true })} · day {s.today}</>} hint="Trading day as defined by the account's day reset hour and timezone." />
        <StatCard
          label="Drawdown"
          value={s.maxDrawdown ? formatMoney(-s.maxDrawdown, ccy) : formatMoney(0, ccy)}
          tone={s.currentDrawdown ? "loss" : undefined}
          sub={`max ${formatPct(s.maxDrawdownPct === null ? null : -s.maxDrawdownPct)} · current ${s.currentDrawdown ? formatMoney(-s.currentDrawdown, ccy) : "none"}`}
          hint="Largest peak-to-trough decline of the closed-trade balance (trading only; withdrawals excluded). Current = decline from the latest peak."
        />
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {s.profitTarget ? (
          <LimitCard
            label="Profit target"
            value={
              <>
                {formatPct(s.profitTarget.progressPct)} <span className="text-sm font-normal text-muted-foreground">of target</span>
              </>
            }
            meter={s.profitTarget.progressPct}
            tone={s.profitTarget.reached ? "profit" : "primary"}
            status={s.profitTarget.reached ? { tone: "profit", word: "Reached" } : undefined}
            lines={[
              <>
                {formatMoney(s.profitTarget.currentProfit, ccy, { sign: true })} / {formatMoney(s.profitTarget.amount, ccy, { sign: true })} target
              </>,
              <>
                Remaining {formatMoney(s.profitTarget.remaining, ccy)} · target balance {formatMoney(s.profitTarget.targetBalance, ccy)}
              </>,
            ]}
          />
        ) : (
          <LimitCard label="Profit target" value={<span className="text-base text-muted-foreground">No target</span>} lines={["Funded or personal account, or no target rule set."]} />
        )}
        {s.dailyLoss && daily ? (
          <LimitCard
            label="Daily loss remaining"
            value={formatMoney(Math.max(0, s.dailyLoss.remaining), ccy)}
            meter={s.dailyLoss.remainingPct}
            tone={daily.tone}
            status={daily}
            meterLabel="Daily loss allowance remaining"
            lines={[
              <>
                Limit {formatMoney(s.dailyLoss.limit, ccy)} · used today {formatMoney(s.dailyLoss.used, ccy)}
              </>,
              <>Today&apos;s floor {formatMoney(s.dailyLoss.floor, ccy)}</>,
            ]}
          />
        ) : (
          <LimitCard label="Daily loss" value={<span className="text-base text-muted-foreground">No daily limit</span>} />
        )}
        {s.overallLoss && overall ? (
          <LimitCard
            label="Max drawdown remaining"
            value={formatMoney(Math.max(0, s.overallLoss.remaining), ccy)}
            meter={s.overallLoss.remainingPct}
            tone={overall.tone}
            status={overall}
            meterLabel="Max drawdown allowance remaining"
            lines={[
              <>
                Floor {formatMoney(s.overallLoss.floor, ccy)} · {DRAWDOWN_TYPE_LABEL[s.overallLoss.type]}
                {s.overallLoss.locked ? " (locked at start)" : ""}
              </>,
              <>
                Max loss {formatMoney(s.overallLoss.limit, ccy)}
                {s.overallLoss.type !== "STATIC" && <> · high-water mark {formatMoney(s.overallLoss.highWaterMark, ccy)}</>}
              </>,
            ]}
          />
        ) : (
          <LimitCard label="Max drawdown" value={<span className="text-base text-muted-foreground">No max loss rule</span>} />
        )}
      </div>
      <p className="-mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
        <Info className="mt-px size-3.5 shrink-0" aria-hidden />
        All limits are measured on closed-trade balance. Open positions can breach a limit on the platform before it shows here.
      </p>

      <AccountTabsNav accountId={a.id} current={tab} counts={{ trades: a.tradeCount, rules: a.violationCount }} />

      {tab === "overview" && <OverviewTab userId={user.id} detail={detail} />}
      {tab === "trades" && <TradesTab userId={user.id} accountId={a.id} currency={ccy} timezone={tz} />}
      {tab === "analytics" && <AnalyticsTab userId={user.id} accountId={a.id} accountCurrency={ccy} />}
      {tab === "journal" && <JournalTab userId={user.id} accountId={a.id} currency={ccy} timezone={tz} />}
      {tab === "rules" && <RulesTab userId={user.id} detail={detail} />}
      {tab === "payouts" && <PayoutsTab userId={user.id} detail={detail} />}
      {tab === "timeline" && <TimelineTab userId={user.id} detail={detail} />}
    </div>
  );
}
