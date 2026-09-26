import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import type { AccountSummary } from "@/server/queries/accounts";
import { formatMoney, formatPct } from "@/lib/format";
import { ACCOUNT_TYPE_LABEL } from "@/lib/labels";
import { Meter, remainingTone } from "@/components/app/meter";
import { Pnl, PctValue } from "@/components/app/pnl";
import { StatusBadge } from "@/components/app/status-badge";

export function AccountCard({ a }: { a: AccountSummary }) {
  const ccy = a.currency;
  const isChallenge = a.status === "CHALLENGE";
  const inactive = a.group === "failed" || a.group === "inactive" || a.status === "PASSED";
  return (
    <Link
      href={`/accounts/${a.id}`}
      className="group flex flex-col gap-3 rounded-lg border bg-card p-4 transition-colors hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-xs text-muted-foreground">{a.firm?.name ?? "No firm"}</div>
          <div className="truncate font-medium">{a.name}</div>
          <div className="text-xs text-muted-foreground">
            {formatMoney(a.accountSize, ccy, { dp: 0 })} · {ACCOUNT_TYPE_LABEL[a.accountType]}
            {a.phase ? ` · Phase ${a.phase}` : ""}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {a.warnings.length > 0 && !inactive && (
            <span title={a.warnings.join("\n")} className="text-warning">
              <AlertTriangle className="size-4" aria-label="Warnings" />
            </span>
          )}
          <StatusBadge status={a.status} />
        </div>
      </div>

      <div className="flex items-end justify-between gap-2">
        <div>
          <div className="text-[11px] text-muted-foreground">Balance</div>
          <div className="text-lg font-semibold tabular">{formatMoney(a.balance, ccy)}</div>
        </div>
        <div className="text-right text-sm">
          <Pnl value={a.tradingPnl} currency={ccy} /> <PctValue value={a.pnlPct} className="text-xs" />
          <div className="text-[11px] text-muted-foreground">
            Today <Pnl value={a.todayPnl} currency={ccy} />
          </div>
        </div>
      </div>

      {isChallenge && a.profitTarget && (
        <div className="flex flex-col gap-1">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Target progress</span>
            <span className="tabular">
              {formatPct(a.profitTarget.progressPct)} · {formatMoney(a.profitTarget.currentProfit, ccy, { sign: true, dp: 0 })} / {formatMoney(a.profitTarget.amount, ccy, { sign: true, dp: 0 })}
            </span>
          </div>
          <Meter value={a.profitTarget.progressPct} tone={a.profitTarget.reached ? "profit" : "primary"} label="Profit target progress" />
        </div>
      )}

      {!inactive && (a.dailyLoss || a.overallLoss) && (
        <div className="grid grid-cols-2 gap-3 text-xs">
          {a.dailyLoss && (
            <div className="flex flex-col gap-1">
              <div className="flex justify-between gap-1">
                <span className="text-muted-foreground">Daily loss left</span>
                <span className="tabular">{formatMoney(Math.max(0, a.dailyLoss.remaining), ccy, { dp: 0 })}</span>
              </div>
              <Meter value={a.dailyLoss.remainingPct} tone={remainingTone(a.dailyLoss.remainingPct)} label="Daily loss remaining" />
            </div>
          )}
          {a.overallLoss && (
            <div className="flex flex-col gap-1">
              <div className="flex justify-between gap-1">
                <span className="text-muted-foreground">Max DD left</span>
                <span className="tabular">{formatMoney(Math.max(0, a.overallLoss.remaining), ccy, { dp: 0 })}</span>
              </div>
              <Meter value={a.overallLoss.remainingPct} tone={remainingTone(a.overallLoss.remainingPct)} label="Max drawdown remaining" />
            </div>
          )}
        </div>
      )}

      {(a.group === "funded") && (
        <div className="flex justify-between border-t pt-2 text-xs">
          <span className="text-muted-foreground">{a.payout.eligible ? "Payout eligible" : "Payout-eligible profit"}</span>
          <span className="tabular">
            {formatMoney(a.payout.eligibleProfit, ccy)}
            {a.payout.estimatedTraderShare !== null && <span className="text-muted-foreground"> (your share {formatMoney(a.payout.estimatedTraderShare, ccy)})</span>}
          </span>
        </div>
      )}
    </Link>
  );
}
