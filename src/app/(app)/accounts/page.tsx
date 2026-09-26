import Link from "next/link";
import { LayoutGrid, Layers, Plus, Rows3 } from "lucide-react";
import { requireUser } from "@/server/session";
import { getAccountsPage, matchesSearch, matchesTab, type AccountFilterTab } from "@/server/queries/account-list";
import { formatMoney, formatPct } from "@/lib/format";
import { ACCOUNT_TYPE_LABEL } from "@/lib/labels";
import { PageHeader, Section } from "@/components/app/page-header";
import { StatCard, StatGrid } from "@/components/app/stat-card";
import { Pnl, PctValue } from "@/components/app/pnl";
import { EmptyState } from "@/components/app/empty-state";
import { StatusBadge } from "@/components/app/status-badge";
import { AccountCard } from "@/components/accounts/account-card";
import { AccountFormDialog } from "@/components/accounts/account-form-dialog";
import { AccountsToolbar } from "@/components/accounts/accounts-toolbar";
import { PropFirmManager } from "@/components/accounts/prop-firm-manager";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export const metadata = { title: "Accounts" };

const TABS: { key: AccountFilterTab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "challenge", label: "Challenges" },
  { key: "funded", label: "Funded" },
  { key: "passed", label: "Passed" },
  { key: "failed", label: "Failed / breached" },
  { key: "archived", label: "Archived" },
];

export default async function AccountsPage(props: PageProps<"/accounts">) {
  const user = await requireUser();
  const sp = await props.searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const statusParam = one(sp.status);
  const tab: AccountFilterTab = TABS.some((t) => t.key === statusParam) ? (statusParam as AccountFilterTab) : "all";
  const q = one(sp.q)?.trim() ?? "";
  const view = one(sp.view) === "table" ? "table" : "grid";
  const openNew = one(sp.new) === "1";

  const { prefs, accounts, portfolio: p, firms } = await getAccountsPage(user.id);
  const ccy = prefs.currency;
  const searched = accounts.filter((a) => matchesSearch(a, q));
  const shown = searched.filter((a) => matchesTab(a, tab));
  const firmOptions = firms.map((f) => ({ id: f.id, name: f.name, ruleTemplate: f.ruleTemplate as Record<string, unknown> | null }));

  const viewHref = (v: "grid" | "table") => {
    const next = new URLSearchParams();
    if (tab !== "all") next.set("status", tab);
    if (q) next.set("q", q);
    if (v === "table") next.set("view", "table");
    return `/accounts${next.size ? `?${next}` : ""}`;
  };

  const addButton = (
    <AccountFormDialog
      mode="create"
      firms={firmOptions}
      defaultCurrency={ccy}
      defaultOpen={openNew}
      clearParamOnClose="new"
      trigger={
        <Button size="sm">
          <Plus /> Add account
        </Button>
      }
    />
  );

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Accounts" description="Every challenge, funded and personal account, with live rule state." actions={addButton} />

      {accounts.length === 0 ? (
        <EmptyState
          icon={<Layers />}
          title="No accounts yet"
          description="Add a challenge, funded or personal account. Its rules (profit target, daily loss, max drawdown) drive every progress bar and warning in PropTrack."
          action={
            <Button asChild>
              <Link href="/accounts?new=1">Add account</Link>
            </Button>
          }
        />
      ) : (
        <>
          <StatGrid>
            <StatCard label="Accounts" value={p.counts.total} sub={`${p.counts.challenge} challenge · ${p.counts.funded} funded`} />
            <StatCard label="Passed / failed" value={`${p.counts.passed} / ${p.counts.failed}`} sub={`${p.counts.inactive} archived or suspended`} />
            <StatCard label="Active capital" value={formatMoney(p.totalCapital, ccy, { dp: 0 })} hint="Sum of account sizes of challenge, passed and funded accounts, converted to your currency." />
            <StatCard label="Combined equity" value={formatMoney(p.combinedEquity, ccy)} hint="Closed-trade balance of active accounts. Open positions are not included." />
            <StatCard label="Trading P&L" value={<Pnl value={p.tradingPnl} currency={ccy} />} sub="All accounts, all time" />
            <StatCard label="Total fees" value={formatMoney(-p.totalFees, ccy)} tone={p.totalFees ? "loss" : undefined} sub="Net of refunds" />
            <StatCard label="Payouts received" value={<Pnl value={p.totalPayouts} currency={ccy} />} sub="Paid payouts only" />
            <StatCard
              label="Net cash flow"
              value={<Pnl value={p.netCashFlow} currency={ccy} />}
              sub={p.roiPct === null ? "No fees recorded" : `ROI on fees ${formatPct(p.roiPct, { sign: true })}`}
              hint="Payouts received − fees paid. Account balances are not cash."
            />
          </StatGrid>
          {p.missingCurrencies.length > 0 && (
            <p className="-mt-2 text-xs text-warning">
              Missing exchange rate for {p.missingCurrencies.join(", ")} — those amounts are excluded from the totals. Add a rate in <Link href="/settings" className="underline">Settings</Link>.
            </p>
          )}

          <div className="grid gap-5 xl:grid-cols-4">
            <div className="flex flex-col gap-3 xl:col-span-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <AccountsToolbar tabs={TABS.map((t) => ({ ...t, count: searched.filter((a) => matchesTab(a, t.key)).length }))} current={tab} query={q} />
                </div>
                <div className="flex shrink-0 items-center gap-0.5 self-end rounded-lg border p-0.5 sm:self-auto" role="group" aria-label="Layout">
                  <Button asChild variant={view === "grid" ? "secondary" : "ghost"} size="icon-sm">
                    <Link href={viewHref("grid")} aria-label="Grid view" aria-current={view === "grid" ? "true" : undefined} scroll={false}>
                      <LayoutGrid />
                    </Link>
                  </Button>
                  <Button asChild variant={view === "table" ? "secondary" : "ghost"} size="icon-sm">
                    <Link href={viewHref("table")} aria-label="Table view" aria-current={view === "table" ? "true" : undefined} scroll={false}>
                      <Rows3 />
                    </Link>
                  </Button>
                </div>
              </div>

              {shown.length === 0 ? (
                <EmptyState
                  title={q ? `No accounts match “${q}”` : "No accounts in this group"}
                  description={q ? "Try a different name, account number or firm." : "Accounts move here as their status changes."}
                  action={
                    <Button asChild variant="outline" size="sm">
                      <Link href="/accounts">Show all accounts</Link>
                    </Button>
                  }
                />
              ) : view === "grid" ? (
                <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
                  {shown.map((a) => (
                    <AccountCard key={a.id} a={a} />
                  ))}
                </div>
              ) : (
                <div className="overflow-x-auto rounded-lg border bg-card">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Account</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Size</TableHead>
                        <TableHead className="text-right">Balance</TableHead>
                        <TableHead className="text-right">P&amp;L</TableHead>
                        <TableHead className="text-right">Target</TableHead>
                        <TableHead className="text-right">DD left</TableHead>
                        <TableHead className="text-right">Fees</TableHead>
                        <TableHead className="text-right">Payouts</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {shown.map((a) => (
                        <TableRow key={a.id}>
                          <TableCell className="max-w-64">
                            <Link href={`/accounts/${a.id}`} className="block truncate font-medium hover:underline">
                              {a.name}
                            </Link>
                            <div className="truncate text-xs text-muted-foreground">
                              {a.firm?.name ?? "No firm"} · {ACCOUNT_TYPE_LABEL[a.accountType]}
                              {a.phase ? ` · P${a.phase}` : ""}
                              {a.accountNumber ? ` · #${a.accountNumber}` : ""}
                            </div>
                          </TableCell>
                          <TableCell>
                            <StatusBadge status={a.status} />
                            {a.warnings.length > 0 && a.group !== "failed" && a.group !== "inactive" && (
                              <span className="ml-1.5 text-xs text-warning" title={a.warnings.join("\n")}>
                                {a.warnings.length} warning{a.warnings.length > 1 ? "s" : ""}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-right tabular">{formatMoney(a.accountSize, a.currency, { dp: 0 })}</TableCell>
                          <TableCell className="text-right tabular">{formatMoney(a.balance, a.currency)}</TableCell>
                          <TableCell className="text-right">
                            <Pnl value={a.tradingPnl} currency={a.currency} /> <PctValue value={a.pnlPct} className="text-xs" />
                          </TableCell>
                          <TableCell className="text-right tabular">{a.profitTarget ? formatPct(a.profitTarget.progressPct) : "—"}</TableCell>
                          <TableCell className={cn("text-right tabular", a.overallLoss && a.overallLoss.remaining <= 0 && "text-loss")}>
                            {a.overallLoss ? formatMoney(Math.max(0, a.overallLoss.remaining), a.currency, { dp: 0 }) : "—"}
                          </TableCell>
                          <TableCell className="text-right tabular text-muted-foreground">{a.economics.fees ? formatMoney(-a.economics.fees, a.currency) : "—"}</TableCell>
                          <TableCell className="text-right">{a.economics.payouts ? <Pnl value={a.economics.payouts} currency={a.currency} /> : <span className="text-muted-foreground">—</span>}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              <p className="text-xs text-muted-foreground">Balances and limits are measured on closed-trade balance; open positions are not included.</p>
            </div>

            <Section title="Prop firms" description={`${firms.length} firm${firms.length === 1 ? "" : "s"}`} className="self-start">
              <PropFirmManager firms={firms.map((f) => ({ ...f, ruleTemplate: f.ruleTemplate as Record<string, unknown> | null }))} />
            </Section>
          </div>
        </>
      )}
    </div>
  );
}
