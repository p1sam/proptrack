import Link from "next/link";
import { ArrowRight, Wallet } from "lucide-react";
import { getAccountPayouts, type AccountDetail } from "@/server/queries/account-detail";
import { formatDate, formatMoney, formatPct } from "@/lib/format";
import { Section } from "@/components/app/page-header";
import { Pnl } from "@/components/app/pnl";
import { PayoutBadge } from "@/components/app/status-badge";
import { EmptyState } from "@/components/app/empty-state";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatList } from "./stat-list";

export async function PayoutsTab({ userId, detail }: { userId: string; detail: AccountDetail }) {
  const { summary: a, state: s, prefs } = detail;
  const payouts = await getAccountPayouts(userId, a.id);
  const manage = `/payouts?accounts=${a.id}`;
  const p = s.payout;
  return (
    <div className="grid gap-5 xl:grid-cols-3">
      <Section
        title="Payouts"
        description="Read-only here"
        className="xl:col-span-2"
        actions={
          <Link href={manage} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            Manage payouts <ArrowRight className="size-3" aria-hidden />
          </Link>
        }
      >
        {payouts.length ? (
          <div className="-mx-4 -my-4 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Requested</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Requested</TableHead>
                  <TableHead className="text-right">Split</TableHead>
                  <TableHead className="text-right">Received</TableHead>
                  <TableHead className="hidden sm:table-cell">Paid</TableHead>
                  <TableHead className="hidden pr-4 md:table-cell">Method</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payouts.map((po) => (
                  <TableRow key={po.id}>
                    <TableCell className="pl-4 tabular">{formatDate(po.requestedAt, prefs.timezone)}</TableCell>
                    <TableCell>
                      <PayoutBadge status={po.status} />
                      {!po.deductFromBalance && <span className="ml-1 text-[11px] text-muted-foreground">not debited</span>}
                    </TableCell>
                    <TableCell className="text-right tabular">{formatMoney(po.amountRequested, po.currency)}</TableCell>
                    <TableCell className="text-right tabular">{po.profitSplitPct === null ? "—" : formatPct(po.profitSplitPct)}</TableCell>
                    <TableCell className="text-right">{po.amountReceived === null ? <span className="text-muted-foreground">—</span> : <Pnl value={po.amountReceived} currency={po.currency} />}</TableCell>
                    <TableCell className="hidden tabular sm:table-cell">{formatDate(po.paidAt, prefs.timezone)}</TableCell>
                    <TableCell className="hidden max-w-32 truncate pr-4 text-muted-foreground md:table-cell">{po.paymentMethod ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <EmptyState
            icon={<Wallet />}
            title="No payouts on this account"
            description="Payout requests are recorded on the Payouts page; requested amounts are debited from the account balance."
            action={
              <Button asChild size="sm" variant="outline">
                <Link href={manage}>Manage payouts</Link>
              </Button>
            }
          />
        )}
      </Section>
      <Section title="Eligibility now" className="self-start">
        <StatList
          rows={[
            ["Status", p.eligible ? "Eligible" : "Not yet eligible"],
            ["Eligible profit", formatMoney(p.eligibleProfit, a.currency)],
            ["Estimated trader share", p.estimatedTraderShare === null ? "No split set" : formatMoney(p.estimatedTraderShare, a.currency)],
            ["Threshold", p.threshold === null ? "None" : `${formatMoney(p.threshold, a.currency)} · ${p.thresholdMet ? "met" : "not met"}`],
            ["Days since last payout", p.daysSinceLastPayout === null ? "—" : `${p.daysSinceLastPayout}${p.frequencyDays !== null ? ` of ${p.frequencyDays}` : ""}`],
            ["Received (paid) total", <Pnl key="r" value={a.economics.payouts} currency={a.currency} />],
          ]}
        />
      </Section>
    </div>
  );
}
