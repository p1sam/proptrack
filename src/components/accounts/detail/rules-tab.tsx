import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { getAccountViolations, type AccountDetail } from "@/server/queries/account-detail";
import { formatDateTime, formatDayKey, formatMoney, formatNumber, formatPct } from "@/lib/format";
import { Section } from "@/components/app/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { RuleEditor } from "../rule-editor";
import { ToneIcon, allowanceStatus, type Tone } from "../limit-card";
import { DAILY_BASIS_LABEL, DRAWDOWN_TYPE_LABEL } from "../rule-labels";

interface EvalRow {
  rule: string;
  current: React.ReactNode;
  limit: React.ReactNode;
  status: { tone: Tone | "neutral"; word: string };
}

const INFO = { tone: "neutral", word: "Info" } as const;
const pass = (ok: boolean, okWord = "Pass", badWord = "Fail"): EvalRow["status"] => (ok ? { tone: "profit", word: okWord } : { tone: "loss", word: badWord });

function evaluate(detail: AccountDetail): EvalRow[] {
  const { state: s, rule: r, summary: a } = detail;
  const ccy = a.currency;
  const count = (k: string) => s.violations.filter((v) => v.ruleKey === k).length;
  const rows: EvalRow[] = [];
  if (!r) return rows;

  if (s.profitTarget)
    rows.push({
      rule: `Profit target (${formatPct(r.profitTargetPct)})`,
      current: `${formatMoney(s.profitTarget.currentProfit, ccy, { sign: true })} (${formatPct(s.profitTarget.progressPct)})`,
      limit: formatMoney(s.profitTarget.amount, ccy, { sign: true }),
      status: s.profitTarget.reached ? { tone: "profit", word: "Reached" } : { tone: "neutral", word: "In progress" },
    });
  if (s.dailyLoss) {
    const st = allowanceStatus(s.dailyLoss.remainingPct, s.dailyLoss.remaining);
    const breaches = count("MAX_DAILY_LOSS");
    rows.push({
      rule: `Max daily loss (${formatPct(r.maxDailyLossPct)}, ${DAILY_BASIS_LABEL[r.dailyLossBasis]})`,
      current: `${formatMoney(s.dailyLoss.used, ccy)} used today · ${formatMoney(Math.max(0, s.dailyLoss.remaining), ccy)} left`,
      limit: formatMoney(s.dailyLoss.limit, ccy),
      status: breaches ? { tone: "loss", word: `Breached ${breaches}×` } : { tone: st.tone, word: st.word === "OK" ? "Pass" : st.word },
    });
  }
  if (s.overallLoss) {
    const st = allowanceStatus(s.overallLoss.remainingPct, s.overallLoss.remaining);
    const breached = count("MAX_OVERALL_LOSS") > 0;
    rows.push({
      rule: `Max overall loss (${formatPct(r.maxOverallLossPct)}, ${DRAWDOWN_TYPE_LABEL[s.overallLoss.type]})`,
      current: `Balance ${formatMoney(s.balance, ccy)} · ${formatMoney(Math.max(0, s.overallLoss.remaining), ccy)} above floor`,
      limit: `Floor ${formatMoney(s.overallLoss.floor, ccy)}${s.overallLoss.locked ? " (locked)" : ""}`,
      status: breached ? { tone: "loss", word: "Breached" } : { tone: st.tone, word: st.word === "OK" ? "Pass" : st.word },
    });
  }
  if (s.minTradingDays)
    rows.push({
      rule: "Min trading days",
      current: `${s.tradingDays} days`,
      limit: `≥ ${s.minTradingDays.required}`,
      status: s.minTradingDays.met ? { tone: "profit", word: "Met" } : { tone: "neutral", word: `${s.minTradingDays.remaining} to go` },
    });
  if (r.maxTradingDays)
    rows.push({ rule: "Max trading days", current: `${s.tradingDays} days`, limit: `≤ ${r.maxTradingDays}`, status: pass(count("MAX_TRADING_DAYS") === 0) });
  if (r.maxPositionSize) {
    const n = count("MAX_POSITION_SIZE");
    rows.push({ rule: "Max position size", current: n ? `${n} trade${n > 1 ? "s" : ""} over the limit` : "No trade over the limit", limit: formatNumber(r.maxPositionSize, 4), status: pass(n === 0) });
  }
  if (!r.weekendHoldingAllowed) {
    const n = count("WEEKEND_HOLDING");
    rows.push({ rule: "No weekend holding", current: n ? `${n} trade${n > 1 ? "s" : ""} held over a weekend` : "None held over a weekend", limit: "Not allowed", status: pass(n === 0) });
  }
  if (!r.newsTradingAllowed) rows.push({ rule: "No news trading", current: "Not checked automatically", limit: "Not allowed", status: { tone: "neutral", word: "Manual" } });
  if (s.consistency)
    rows.push({
      rule: "Consistency",
      current: s.consistency.ratioPct === null ? "No profit yet" : `Best day ${formatPct(s.consistency.ratioPct)} of profit`,
      limit: `≤ ${formatPct(s.consistency.limitPct)}`,
      status: s.consistency.passes ? { tone: "profit", word: "Pass" } : { tone: "warning", word: "Not satisfied" },
    });
  if (r.payoutThresholdAmount !== null)
    rows.push({ rule: "Payout threshold", current: formatMoney(s.payout.eligibleProfit, ccy), limit: formatMoney(r.payoutThresholdAmount, ccy), status: s.payout.thresholdMet ? { tone: "profit", word: "Met" } : { tone: "neutral", word: "Not yet" } });
  if (r.payoutFrequencyDays !== null)
    rows.push({
      rule: "Payout frequency",
      current: s.payout.daysSinceLastPayout === null ? "—" : `${s.payout.daysSinceLastPayout} days since last`,
      limit: `Every ${r.payoutFrequencyDays} days`,
      status: s.payout.frequencyMet ? { tone: "profit", word: "Met" } : { tone: "neutral", word: "Not yet" },
    });
  if (r.profitSplitPct !== null) rows.push({ rule: "Profit split", current: s.payout.estimatedTraderShare === null ? "—" : `Your share ${formatMoney(s.payout.estimatedTraderShare, ccy)}`, limit: formatPct(r.profitSplitPct), status: INFO });
  rows.push({ rule: "Trading day boundary", current: `${String(r.dayResetHour).padStart(2, "0")}:00`, limit: r.dayResetTimezone ?? `${detail.prefs.timezone} (your timezone)`, status: INFO });
  return rows;
}

export async function RulesTab({ userId, detail }: { userId: string; detail: AccountDetail }) {
  const { summary: a, prefs } = detail;
  const violations = await getAccountViolations(userId, a.id);
  const rows = evaluate(detail);
  const breaches = violations.filter((v) => v.severity === "BREACH").length;

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-5 xl:grid-cols-2">
        <Section title="Prop rules" description="Blank = no such rule. Saving recalculates the account and its violations.">
          <RuleEditor accountId={a.id} rule={detail.rule} currency={a.currency} />
        </Section>
        <Section title="Live evaluation" description="Current value vs limit, on closed-trade balance" className="self-start">
          {rows.length ? (
            <div className="-mx-4 -my-4 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4">Rule</TableHead>
                    <TableHead>Current</TableHead>
                    <TableHead>Limit</TableHead>
                    <TableHead className="pr-4">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.rule}>
                      <TableCell className="pl-4 font-medium whitespace-normal">{r.rule}</TableCell>
                      <TableCell className="tabular whitespace-normal text-muted-foreground">{r.current}</TableCell>
                      <TableCell className="tabular whitespace-normal">{r.limit}</TableCell>
                      <TableCell className="pr-4">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 text-xs font-medium whitespace-nowrap",
                            r.status.tone === "loss" && "text-loss",
                            r.status.tone === "warning" && "text-warning",
                            r.status.tone === "profit" && "text-profit",
                            r.status.tone === "neutral" && "text-muted-foreground",
                          )}
                        >
                          {r.status.tone !== "neutral" && <ToneIcon tone={r.status.tone} />}
                          {r.status.word}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No rules saved yet. Set a profit target, daily loss or max drawdown to see live progress and warnings.</p>
          )}
        </Section>
      </div>

      <Section
        title="Rule violations"
        description={violations.length ? `${violations.length} recorded · ${breaches} breach${breaches === 1 ? "" : "es"}${violations.length >= 200 ? " (latest 200)" : ""}` : undefined}
        actions={
          <Link href={`/risk?accounts=${a.id}`} className="text-xs text-muted-foreground hover:text-foreground">
            Risk overview
          </Link>
        }
      >
        {violations.length ? (
          <ul className="-my-2 divide-y text-sm">
            {violations.map((v) => (
              <li key={v.id} className="flex items-start gap-2 py-2">
                <ShieldAlert className={v.severity === "BREACH" ? "mt-0.5 size-4 shrink-0 text-loss" : "mt-0.5 size-4 shrink-0 text-warning"} aria-hidden />
                <div className="min-w-0 flex-1">
                  <div>
                    <span className={cn("mr-1.5 text-xs font-medium", v.severity === "BREACH" ? "text-loss" : "text-warning")}>{v.severity === "BREACH" ? "Breach" : "Warning"}</span>
                    {v.message}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {formatDayKey(v.day)} · {formatDateTime(v.occurredAt, prefs.timezone)} · {v.source === "PROP_RULE" ? "Prop rule" : "Your rule"} · {v.ruleKey.replaceAll("_", " ").toLowerCase()}
                    {v.tradeId && (
                      <>
                        {" · "}
                        <Link href={`/trades/${v.tradeId}`} className="hover:underline">
                          trade
                        </Link>
                      </>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No violations recorded for this account.</p>
        )}
      </Section>
    </div>
  );
}
