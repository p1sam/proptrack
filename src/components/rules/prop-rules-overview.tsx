import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { RuleTone } from "@/lib/calc/rule-status";
import { formatMoney, formatPct } from "@/lib/format";
import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/app/status-badge";
import type { PropRuleOverviewRow } from "@/server/queries/rules-overview";

const TONE_CLASS: Record<RuleTone, string> = {
  ok: "text-foreground",
  met: "text-profit",
  warning: "text-warning",
  breach: "text-loss",
  off: "text-muted-foreground",
  unchecked: "text-muted-foreground",
};
const TONE_WORD: Record<RuleTone, string> = { ok: "OK", met: "Met", warning: "Warning", breach: "Breached", off: "", unchecked: "Not checked" };

const DD_LABEL = { STATIC: "static", TRAILING_EOD: "trailing EOD", TRAILING_BALANCE: "trailing" } as const;

function Cell({ tone, value, detail }: { tone: RuleTone; value: React.ReactNode; detail?: React.ReactNode }) {
  if (tone === "off" && !detail) return <td className="px-3 py-2 align-top text-muted-foreground">—</td>;
  return (
    <td className="px-3 py-2 align-top">
      <div className="whitespace-nowrap tabular">{value}</div>
      {detail && (
        <div className={cn("text-[11px] whitespace-nowrap", TONE_CLASS[tone])}>
          {tone !== "ok" && tone !== "off" && <span className="font-medium">{TONE_WORD[tone]} · </span>}
          {detail}
        </div>
      )}
    </td>
  );
}

/** Read-only matrix of accounts × prop-firm rules with live status. */
export function PropRulesOverview({ rows }: { rows: PropRuleOverviewRow[] }) {
  if (!rows.length) return <p className="text-sm text-muted-foreground">No active accounts.</p>;
  return (
    <div className="-mx-4 -my-4 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground">
            <th className="sticky left-0 bg-card px-4 py-2 font-medium">Account</th>
            <th className="px-3 py-2 font-medium">Profit target</th>
            <th className="px-3 py-2 font-medium">Daily loss</th>
            <th className="px-3 py-2 font-medium">Max loss</th>
            <th className="px-3 py-2 font-medium">Min days</th>
            <th className="px-3 py-2 font-medium">Consistency</th>
            <th className="px-3 py-2 font-medium">Payout</th>
            <th className="px-3 py-2 font-medium">Weekend / size</th>
            <th className="px-3 py-2 font-medium">News</th>
            <th className="px-3 py-2"><span className="sr-only">Edit</span></th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((a) => {
            const r = a.rule;
            const L = a.live;
            const t = a.tones;
            const m = (v: number | null | undefined, dp = 0) => formatMoney(v, a.currency, { dp });
            const payoutBits = r ? [r.payoutThresholdAmount !== null ? `min ${m(r.payoutThresholdAmount)}` : null, r.payoutFrequencyDays ? `every ${r.payoutFrequencyDays}d` : null, r.profitSplitPct !== null ? `${formatPct(r.profitSplitPct)} split` : null].filter(Boolean) : [];
            return (
              <tr key={a.id} className="hover:bg-muted/30">
                <td className="sticky left-0 bg-card px-4 py-2 align-top">
                  <Link href={`/accounts/${a.id}`} className="font-medium hover:underline">
                    {a.name}
                  </Link>
                  <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <StatusBadge status={a.status} />
                    <span className="truncate">{a.firmName ?? "No firm"}</span>
                  </div>
                </td>
                {!r ? (
                  <td colSpan={8} className="px-3 py-2 align-top text-muted-foreground">
                    No prop-firm rules set.{" "}
                    <Link href={`/accounts/${a.id}?tab=rules`} className="text-foreground underline-offset-4 hover:underline">
                      Add rules
                    </Link>
                  </td>
                ) : (
                  <>
                    <Cell
                      tone={t.profitTarget}
                      value={r.profitTargetPct !== null ? `${formatPct(r.profitTargetPct)}${L.profitTarget ? ` · ${m(L.profitTarget.amount)}` : ""}` : "—"}
                      detail={L.profitTarget ? (L.profitTarget.reached ? `${m(L.profitTarget.currentProfit)} made` : `${m(L.profitTarget.remaining)} to go (${formatPct(L.profitTarget.progressPct)})`) : undefined}
                    />
                    <Cell
                      tone={t.dailyLoss}
                      value={r.maxDailyLossPct !== null ? `${formatPct(r.maxDailyLossPct)}${r.dailyLossBasis === "DAY_START_BALANCE" ? " of day start" : ""}` : "—"}
                      detail={L.dailyLoss ? `${m(Math.max(0, L.dailyLoss.remaining))} left of ${m(L.dailyLoss.limit)} today` : undefined}
                    />
                    <Cell
                      tone={t.maxLoss}
                      value={r.maxOverallLossPct !== null ? `${formatPct(r.maxOverallLossPct)} ${DD_LABEL[r.drawdownType]}` : "—"}
                      detail={L.overallLoss ? `${m(Math.max(0, L.overallLoss.remaining))} left of ${m(L.overallLoss.limit)}${L.overallLoss.locked ? " · floor locked" : ""}` : undefined}
                    />
                    <Cell
                      tone={t.minDays}
                      value={r.minTradingDays ? `${r.minTradingDays} days${r.maxTradingDays ? ` · max ${r.maxTradingDays}` : ""}` : r.maxTradingDays ? `max ${r.maxTradingDays}` : "—"}
                      detail={L.minTradingDays ? `${L.tradingDays} traded${L.minTradingDays.met ? "" : `, ${L.minTradingDays.remaining} to go`}` : undefined}
                    />
                    <Cell
                      tone={t.consistency}
                      value={r.consistencyPct !== null ? `best day ≤ ${formatPct(r.consistencyPct)}` : "—"}
                      detail={L.consistency ? (L.consistency.ratioPct === null ? "no profit yet" : `best day ${formatPct(L.consistency.ratioPct)} of profit`) : undefined}
                    />
                    <Cell
                      tone={t.payout}
                      value={payoutBits.length ? payoutBits.join(" · ") : "—"}
                      detail={t.payout !== "off" ? (L.payout.eligible ? `eligible · ${m(L.payout.eligibleProfit)}` : !L.payout.thresholdMet ? `${m(L.payout.eligibleProfit)} profit, below minimum` : !L.payout.frequencyMet ? `next window in ${Math.max(0, (L.payout.frequencyDays ?? 0) - (L.payout.daysSinceLastPayout ?? 0))}d` : "not yet eligible") : undefined}
                    />
                    <Cell
                      tone={t.weekend === "warning" || t.positionSize === "warning" ? "warning" : t.weekend === "off" && t.positionSize === "off" ? "off" : "ok"}
                      value={[r.weekendHoldingAllowed ? "weekend OK" : "no weekend holds", r.maxPositionSize !== null ? `max ${r.maxPositionSize} lots` : null].filter(Boolean).join(" · ")}
                      detail={
                        (a.violations.WEEKEND_HOLDING ?? 0) + (a.violations.MAX_POSITION_SIZE ?? 0) > 0
                          ? [a.violations.WEEKEND_HOLDING ? `${a.violations.WEEKEND_HOLDING} weekend hold${a.violations.WEEKEND_HOLDING === 1 ? "" : "s"}` : null, a.violations.MAX_POSITION_SIZE ? `${a.violations.MAX_POSITION_SIZE} oversized` : null].filter(Boolean).join(" · ")
                          : t.weekend !== "off" || t.positionSize !== "off"
                            ? "checked, no breaks"
                            : undefined
                      }
                    />
                    <Cell tone={t.news} value={r.newsTradingAllowed ? "allowed" : "restricted"} detail={t.news === "unchecked" ? "not auto-checked" : undefined} />
                  </>
                )}
                <td className="px-3 py-2 text-right align-top">
                  <Link href={`/accounts/${a.id}?tab=rules`} className="inline-flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground" aria-label={`Edit rules of ${a.name}`}>
                    Edit <ArrowUpRight className="size-3" />
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
