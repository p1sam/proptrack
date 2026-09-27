import Link from "next/link";
import { Target } from "lucide-react";
import { requireUser } from "@/server/session";
import { getChallengesPage } from "@/server/queries/account-list";
import type { AccountSummary } from "@/server/queries/accounts";
import { formatDate, formatMoney, formatPct } from "@/lib/format";
import { ACCOUNT_TYPE_LABEL } from "@/lib/labels";
import { PageHeader, Section } from "@/components/app/page-header";
import { StatCard, StatGrid } from "@/components/app/stat-card";
import { EmptyState } from "@/components/app/empty-state";
import { Meter } from "@/components/app/meter";
import { Pnl } from "@/components/app/pnl";
import { StatusBadge } from "@/components/app/status-badge";
import { allowanceStatus, ToneIcon } from "@/components/accounts/limit-card";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const metadata = { title: "Challenges" };

/** Text progress bar, e.g. "████████░░ 72%" — a second, colour-free cue beside the meter. */
function textBar(pct: number) {
  const filled = Math.max(0, Math.min(10, Math.round(pct / 10)));
  return `${"█".repeat(filled)}${"░".repeat(10 - filled)}`;
}

function Row({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right tabular">
        {value}
        {sub && <span className="ml-1 text-xs text-muted-foreground">{sub}</span>}
      </span>
    </div>
  );
}

function ChallengeCard({ a, tz }: { a: AccountSummary; tz: string }) {
  const ccy = a.currency;
  const t = a.profitTarget;
  const daily = a.dailyLoss ? allowanceStatus(a.dailyLoss.remainingPct, a.dailyLoss.remaining) : null;
  const overall = a.overallLoss ? allowanceStatus(a.overallLoss.remainingPct, a.overallLoss.remaining) : null;
  return (
    <div className="flex flex-col gap-4 rounded-lg border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-xs text-muted-foreground">{a.firm?.name ?? "No firm"}</div>
          <Link href={`/accounts/${a.id}`} className="block truncate font-medium hover:underline">
            {a.name}
          </Link>
          <div className="text-xs text-muted-foreground">
            {formatMoney(a.accountSize, ccy, { dp: 0 })} · {ACCOUNT_TYPE_LABEL[a.accountType]}
            {a.phase ? ` · Phase ${a.phase}` : ""}
            {a.startedAt && ` · started ${formatDate(a.startedAt, tz)}`}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <StatusBadge status={a.status} />
          {a.passEligible && <span className="rounded-md border border-profit/30 bg-profit/15 px-1.5 py-0.5 text-[11px] font-medium text-profit">Pass criteria met</span>}
          {a.breached && <span className="rounded-md border border-loss/30 bg-loss/15 px-1.5 py-0.5 text-[11px] font-medium text-loss">Rule breached</span>}
        </div>
      </div>

      {t ? (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between text-sm">
            <span className="text-muted-foreground">Progress</span>
            <span className="font-mono text-xs tracking-tight" aria-hidden>
              {textBar(t.progressPct)} <span className="font-sans text-sm font-semibold">{formatPct(t.progressPct, { dp: 0 })}</span>
            </span>
          </div>
          <Meter value={t.progressPct} tone={t.reached ? "profit" : "primary"} label={`Profit target progress ${formatPct(t.progressPct)}`} />
          <div className="text-sm tabular">
            <Pnl value={t.currentProfit} currency={ccy} dp={0} /> <span className="text-muted-foreground">/ {formatMoney(t.amount, ccy, { sign: true, dp: 0 })} target</span>
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No profit target set — add one in the account&apos;s Rules tab.</p>
      )}

      <div className="flex flex-col gap-1.5 border-t pt-3">
        <Row label="Starting balance" value={formatMoney(a.startingBalance, ccy)} />
        <Row label="Current balance" value={formatMoney(a.balance, ccy)} />
        {t && <Row label="Profit target" value={formatMoney(t.targetBalance, ccy)} sub={`(${formatMoney(t.amount, ccy, { dp: 0 })})`} />}
        {t && <Row label="Current profit" value={<Pnl value={t.currentProfit} currency={ccy} />} />}
        {t && <Row label="Target remaining" value={formatMoney(t.remaining, ccy)} />}
      </div>

      <div className="flex flex-col gap-1.5 border-t pt-3">
        {a.dailyLoss && daily ? (
          <>
            <Row label="Daily loss limit" value={formatMoney(a.dailyLoss.limit, ccy)} />
            <Row label="Current daily loss" value={formatMoney(a.dailyLoss.used, ccy)} />
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="flex items-center gap-1 text-muted-foreground">
                <ToneIcon tone={daily.tone} /> Daily loss remaining <span className="text-xs">({daily.word})</span>
              </span>
              <span className="tabular">{formatMoney(Math.max(0, a.dailyLoss.remaining), ccy)}</span>
            </div>
            <Meter value={a.dailyLoss.remainingPct} tone={daily.tone} label="Daily loss remaining" />
          </>
        ) : (
          <Row label="Daily loss limit" value="Not set" />
        )}
      </div>

      <div className="flex flex-col gap-1.5 border-t pt-3">
        {a.overallLoss && overall ? (
          <>
            <Row label={a.overallLoss.type === "STATIC" ? "Maximum drawdown" : "Trailing drawdown"} value={formatMoney(a.overallLoss.limit, ccy)} sub={`floor ${formatMoney(a.overallLoss.floor, ccy, { dp: 0 })}`} />
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="flex items-center gap-1 text-muted-foreground">
                <ToneIcon tone={overall.tone} /> Remaining drawdown <span className="text-xs">({overall.word})</span>
              </span>
              <span className="tabular">{formatMoney(Math.max(0, a.overallLoss.remaining), ccy)}</span>
            </div>
            <Meter value={a.overallLoss.remainingPct} tone={overall.tone} label="Drawdown remaining" />
          </>
        ) : (
          <Row label="Maximum drawdown" value="Not set" />
        )}
      </div>

      <div className="flex flex-col gap-1.5 border-t pt-3">
        <Row label="Trading days" value={a.tradingDays} />
        {a.minTradingDays && (
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="flex items-center gap-1 text-muted-foreground">
              <ToneIcon tone={a.minTradingDays.met ? "profit" : "primary"} /> Minimum days remaining
            </span>
            <span className="tabular">{a.minTradingDays.met ? `Met (${a.minTradingDays.required})` : `${a.minTradingDays.remaining} of ${a.minTradingDays.required}`}</span>
          </div>
        )}
        {a.consistency && (
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="flex items-center gap-1 text-muted-foreground">
              <ToneIcon tone={a.consistency.passes ? "profit" : "warning"} /> Consistency ({formatPct(a.consistency.limitPct, { dp: 0 })} max)
            </span>
            <span className="tabular">{a.consistency.ratioPct === null ? "—" : formatPct(a.consistency.ratioPct)}</span>
          </div>
        )}
      </div>

      {a.warnings.length > 0 && (
        <ul className="flex flex-col gap-1 rounded-md border border-warning/30 bg-warning/10 p-2 text-xs">
          {a.warnings.map((w) => (
            <li key={w} className="flex gap-1.5">
              <ToneIcon tone="warning" className="mt-px" /> {w}
            </li>
          ))}
        </ul>
      )}
      <p className="text-[11px] text-muted-foreground">Limits are measured on closed-trade balance; open positions are not included.</p>
    </div>
  );
}

export default async function ChallengesPage() {
  const user = await requireUser();
  const d = await getChallengesPage(user.id);
  const ccy = d.prefs.currency;
  const tz = d.prefs.timezone;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Challenges"
        description="How close each evaluation is to passing, and how much room is left."
        actions={
          <Button asChild size="sm">
            <Link href="/accounts?new=1">Add challenge</Link>
          </Button>
        }
      />

      <StatGrid className="xl:grid-cols-4">
        <StatCard label="Active challenges" value={d.active.length} />
        <StatCard
          label="Pass rate"
          value={formatPct(d.portfolio.passRate)}
          sub={`${d.portfolio.evaluationsResolved} resolved evaluation${d.portfolio.evaluationsResolved === 1 ? "" : "s"}`}
          hint="Passed ÷ (passed + failed/breached) over resolved evaluation accounts. Each phase of a multi-step challenge counts as its own evaluation."
        />
        <StatCard label="Spent on evaluations" value={formatMoney(d.challengeFees, ccy)} sub="Challenge and reset fees, net of refunds" />
        <StatCard label="Pass criteria met" value={d.active.filter((a) => a.passEligible).length} sub="Target reached, days met, no breach" />
      </StatGrid>
      {d.feesMissingCurrencies.length > 0 && <p className="-mt-3 text-xs text-warning">Fees in {d.feesMissingCurrencies.join(", ")} are excluded — add an exchange rate in Settings.</p>}

      {d.active.length ? (
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {d.active.map((a) => (
            <ChallengeCard key={a.id} a={a} tz={tz} />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<Target />}
          title="No active challenges"
          description="Add an evaluation account with its rules and PropTrack will track target progress, daily loss and drawdown after every trade."
          action={
            <Button asChild>
              <Link href="/accounts?new=1">Add account</Link>
            </Button>
          }
        />
      )}

      {d.resolved.length > 0 && (
        <Collapsible>
          <Section
            title="Resolved challenges"
            description={`${d.resolved.length} passed, failed or breached evaluations`}
            actions={
              <CollapsibleTrigger asChild>
                <Button variant="outline" size="sm">
                  Show / hide
                </Button>
              </CollapsibleTrigger>
            }
          >
            <CollapsibleContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Account</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Target progress</TableHead>
                      <TableHead className="text-right">P&amp;L</TableHead>
                      <TableHead className="text-right">Trading days</TableHead>
                      <TableHead className="text-right">Fees</TableHead>
                      <TableHead className="text-right">Ended</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {d.resolved.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell>
                          <Link href={`/accounts/${a.id}`} className="font-medium hover:underline">
                            {a.name}
                          </Link>
                          <div className="text-xs text-muted-foreground">{a.firm?.name ?? "No firm"}</div>
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={a.status} />
                        </TableCell>
                        <TableCell className="text-right tabular">{a.profitTarget ? formatPct(a.profitTarget.progressPct, { dp: 0 }) : "—"}</TableCell>
                        <TableCell className="text-right">
                          <Pnl value={a.tradingPnl} currency={a.currency} />
                        </TableCell>
                        <TableCell className="text-right tabular">{a.tradingDays}</TableCell>
                        <TableCell className="text-right tabular">{formatMoney(a.economics.fees, a.currency)}</TableCell>
                        <TableCell className="text-right tabular text-muted-foreground">{formatDate(a.endedAt, tz)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CollapsibleContent>
          </Section>
        </Collapsible>
      )}
    </div>
  );
}
