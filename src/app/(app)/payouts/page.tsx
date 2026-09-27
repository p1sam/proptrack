import Link from "next/link";
import { BadgeCheck } from "lucide-react";
import { requireUser } from "@/server/session";
import { getPayoutsPage, parsePayoutFilters } from "@/server/queries/payouts";
import { formatMoney, formatRatio } from "@/lib/format";
import { PAYOUT_STATUS_LABEL } from "@/lib/labels";
import { PageHeader, Section } from "@/components/app/page-header";
import { StatCard, StatGrid } from "@/components/app/stat-card";
import { Button } from "@/components/ui/button";
import { PayoutCumulativeChart, PayoutMonthlyChart } from "@/components/payouts/payout-charts";
import { PayoutsManager } from "@/components/payouts/payouts-manager";
import { UrlFilterRow } from "@/components/payouts/url-filter-row";

export const metadata = { title: "Payouts" };

export default async function PayoutsPage(props: PageProps<"/payouts">) {
  const user = await requireUser();
  const sp = await props.searchParams;
  const filters = parsePayoutFilters(sp);
  const d = await getPayoutsPage(user.id, filters);
  const ccy = d.prefs.currency;
  const s = d.stats;
  const openNew = sp.new === "1";
  const prefillAccount = openNew && filters.accounts.length === 1 && d.accountOptions.some((a) => a.id === filters.accounts[0]) ? filters.accounts[0] : null;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Payouts" description={`Cash withdrawn from funded accounts, converted to ${ccy}.`} />

      <UrlFilterRow
        fields={[
          { kind: "multi", param: "accounts", label: "Account", options: d.accountOptions.map((a) => ({ value: a.id, label: a.name })) },
          { kind: "multi", param: "firms", label: "Prop firm", options: d.firmOptions.map((f) => ({ value: f.id, label: f.name })) },
          { kind: "multi", param: "statuses", label: "Status", options: (["PENDING", "REQUESTED", "APPROVED", "PAID", "REJECTED"] as const).map((v) => ({ value: v, label: PAYOUT_STATUS_LABEL[v] })) },
          { kind: "single", param: "year", label: "Year", allLabel: "All years", options: d.years.map((y) => ({ value: y, label: y })) },
        ]}
      />

      <StatGrid>
        <StatCard label="Total received" value={formatMoney(s.totalReceived, ccy)} sub={`${s.paidCount} paid payout${s.paidCount === 1 ? "" : "s"}`} tone={s.totalReceived > 0 ? "profit" : undefined} hint="Net cash actually received (payouts marked Paid), converted with your exchange rates." />
        <StatCard label="This month" value={formatMoney(s.thisMonth, ccy)} hint="By payment date, in your timezone." />
        <StatCard label="This year" value={formatMoney(s.thisYear, ccy)} />
        <StatCard label="Average payout" value={formatMoney(s.average, ccy)} />
        <StatCard label="Largest payout" value={formatMoney(s.largest, ccy)} />
        <StatCard label="Pending" value={formatMoney(s.pendingAmount, ccy)} sub={`${s.pendingCount} open request${s.pendingCount === 1 ? "" : "s"}`} tone={s.pendingCount ? "warning" : undefined} hint="Gross amount requested on payouts that are pending, requested or approved but not yet paid." />
        <StatCard label="Payout ROI on fees" value={d.roi.multiple === null ? "—" : `${formatRatio(d.roi.multiple)}×`} sub={`Fees ${formatMoney(d.roi.fees, ccy)}`} hint="All-time cash received ÷ net fees paid (fees − refunds) for the accounts in scope. Not narrowed by year or status filters." />
        <StatCard label="Rejected" value={s.rejectedCount} />
      </StatGrid>
      {d.missingCurrencies.length > 0 && (
        <p className="-mt-2 text-xs text-warning">
          Amounts in {d.missingCurrencies.join(", ")} are excluded from totals — add an exchange rate in <Link href="/settings" className="underline">Settings</Link>.
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Section title="Received per month" description={`By payment date, ${ccy}`}>
          <PayoutMonthlyChart data={s.monthly} currency={ccy} />
        </Section>
        <Section title="Cumulative received" description={`Running total, ${ccy}`}>
          <PayoutCumulativeChart data={s.monthly} currency={ccy} />
        </Section>
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <Section title="Eligible for payout now" description="Funded accounts that meet their payout rules today" className="xl:col-span-2">
          {d.eligible.length ? (
            <ul className="-my-2 divide-y">
              {d.eligible.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                  <BadgeCheck className="size-4 shrink-0 text-profit" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <Link href={`/accounts/${a.id}`} className="font-medium hover:underline">
                      {a.name}
                    </Link>
                    <div className="text-xs text-muted-foreground">
                      {a.firmName ?? "No prop firm"}
                      {a.daysSinceLastPayout !== null ? ` · ${a.daysSinceLastPayout} days since last payout` : ""}
                      {a.threshold !== null ? ` · minimum ${formatMoney(a.threshold, a.currency, { dp: 0 })}` : ""}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="tabular">{formatMoney(a.eligibleProfit, a.currency)}</div>
                    <div className="text-xs text-muted-foreground">eligible profit</div>
                  </div>
                  <div className="w-28 text-right">
                    <div className="tabular text-profit">{a.estimatedShare === null ? "—" : formatMoney(a.estimatedShare, a.currency)}</div>
                    <div className="text-xs text-muted-foreground">{a.estimatedShare === null ? "no split set" : "your est. share"}</div>
                  </div>
                  {a.hasOpenRequest ? (
                    <span className="w-36 text-right text-xs text-muted-foreground">Request already open</span>
                  ) : (
                    <Button asChild size="sm" variant="outline" className="w-36">
                      <Link href={`/payouts?new=1&accounts=${a.id}`} scroll={false}>
                        Record request
                      </Link>
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No funded account is eligible right now. Eligibility uses each account’s payout threshold, frequency, minimum trading days and consistency rules on closed-trade balance.</p>
          )}
        </Section>
        <Section title="By prop firm" description={`Received, ${ccy}`}>
          {s.byFirm.length ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="pb-2 font-medium">Firm</th>
                  <th className="pb-2 text-right font-medium">Paid</th>
                  <th className="pb-2 text-right font-medium">Received</th>
                  <th className="pb-2 text-right font-medium">Pending</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {s.byFirm.map((f) => (
                  <tr key={f.key}>
                    <td className="py-1.5">{f.name}</td>
                    <td className="py-1.5 text-right tabular">{f.count}</td>
                    <td className="py-1.5 text-right tabular">{formatMoney(f.received, ccy)}</td>
                    <td className="py-1.5 text-right tabular text-muted-foreground">{f.pending ? formatMoney(f.pending, ccy) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-muted-foreground">No payouts yet.</p>
          )}
        </Section>
      </div>

      <Section title="Payout history">
        <PayoutsManager
          key={openNew ? `new-${prefillAccount ?? ""}` : "list"}
          rows={d.rows}
          accounts={d.accountOptions}
          methods={d.methods}
          timezone={d.prefs.timezone}
          openNew={openNew}
          defaultAccountId={prefillAccount}
          filtered={d.filtered}
        />
      </Section>
    </div>
  );
}
