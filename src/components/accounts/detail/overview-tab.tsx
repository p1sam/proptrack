import { loadDataset } from "@/server/queries/dataset";
import { statsOf } from "@/server/queries/analytics";
import type { AccountDetail } from "@/server/queries/account-detail";
import { parseTradeFilters } from "@/lib/filters";
import { subMoney } from "@/lib/calc/money";
import { formatDate, formatDayKey, formatMoney, formatPct, formatR, formatRatio } from "@/lib/format";
import { FEE_LABEL } from "@/lib/labels";
import { Section } from "@/components/app/page-header";
import { Pnl, PctValue, RValue } from "@/components/app/pnl";
import { Meter } from "@/components/app/meter";
import { BalanceFloorChart } from "../balance-floor-chart";
import { DeleteFeeButton } from "../delete-buttons";
import { ToneIcon } from "../limit-card";
import { StatList, type StatRow } from "./stat-list";

export async function OverviewTab({ userId, detail }: { userId: string; detail: AccountDetail }) {
  const { summary: a, state: s, prefs, fees } = detail;
  const ccy = a.currency;
  const tz = prefs.timezone;
  const ds = await loadDataset(userId, parseTradeFilters({ accounts: a.id }));
  const st = statsOf(ds.trades, ds);
  const sccy = ds.currency;
  const e = a.economics;

  const points = s.points.map((p) => ({ at: p.at.toISOString(), balance: p.balance, floor: p.floor, room: p.floor === null ? null : subMoney(p.balance, p.floor), kind: p.kind }));

  const balanceRows: StatRow[] = [
    ["Starting balance", formatMoney(s.startingBalance, ccy)],
    ["Current balance", formatMoney(s.balance, ccy)],
    ["Net P&L", <Pnl key="pnl" value={s.tradingPnl} currency={ccy} />],
    ["P&L %", <PctValue key="pct" value={s.pnlPct} />],
    ["Daily P&L (today)", <span key="d"><Pnl value={s.todayPnl} currency={ccy} /> <PctValue value={s.todayPnlPct} className="text-xs" /></span>],
    ["Payouts withdrawn from balance", s.totalWithdrawn ? formatMoney(s.totalWithdrawn, ccy) : "—"],
  ];

  const ddRows: StatRow[] = [
    ["Max drawdown", s.maxDrawdown ? `${formatMoney(-s.maxDrawdown, ccy)} (${formatPct(s.maxDrawdownPct === null ? null : -s.maxDrawdownPct)})` : "None"],
    ["Current drawdown", s.currentDrawdown ? `${formatMoney(-s.currentDrawdown, ccy)} (${formatPct(s.currentDrawdownPct === null ? null : -s.currentDrawdownPct)})` : "None"],
    ["Remaining to max DD floor", s.overallLoss ? formatMoney(Math.max(0, s.overallLoss.remaining), ccy) : "No rule"],
    ["Daily loss remaining", s.dailyLoss ? formatMoney(Math.max(0, s.dailyLoss.remaining), ccy) : "No rule"],
    [
      "Profit target",
      s.profitTarget ? (
        <span key="t" className="flex flex-col items-end gap-1">
          <span>
            {formatMoney(s.profitTarget.currentProfit, ccy, { sign: true })} / {formatMoney(s.profitTarget.amount, ccy, { sign: true })} · {formatPct(s.profitTarget.progressPct)}
          </span>
          <Meter value={s.profitTarget.progressPct} tone={s.profitTarget.reached ? "profit" : "primary"} className="w-28" label="Profit target progress" />
        </span>
      ) : (
        "No target"
      ),
    ],
    ["Target remaining", s.profitTarget ? formatMoney(s.profitTarget.remaining, ccy) : "—"],
  ];

  const tradeRows: StatRow[] = [
    ["Closed trades", String(st.totalTrades)],
    ["Winning / losing", `${st.wins} / ${st.losses}${st.breakevens ? ` (+${st.breakevens} BE)` : ""}`],
    ["Win rate", formatPct(st.winRate), "Break-even trades are excluded from the denominator."],
    ["Profit factor", st.profitFactor === null ? (st.wins > 0 ? "∞" : "—") : formatRatio(st.profitFactor)],
    ["Average win", <Pnl key="aw" value={st.averageWinner} currency={sccy} />],
    ["Average loss", <Pnl key="al" value={st.averageLoser} currency={sccy} />],
    ["Expectancy / trade", <Pnl key="ex" value={st.expectancy} currency={sccy} />],
    ["Average R", <span key="r"><RValue value={st.averageR} /> <span className="text-xs text-muted-foreground">n={st.tradesWithR}</span></span>, "Only trades with a defined stop / risk have an R value."],
    ["Total R", formatR(st.totalR)],
    ["Max consecutive wins / losses", `${st.maxConsecutiveWins} / ${st.maxConsecutiveLosses}`],
  ];

  const dayRows: StatRow[] = [
    ["Trading days", String(s.tradingDays)],
    ["Min trading days", s.minTradingDays ? `${s.minTradingDays.required} required · ${s.minTradingDays.remaining} remaining` : "No rule"],
    ["Best day", s.bestDay ? <span key="b"><Pnl value={s.bestDay.netPnl} currency={ccy} /> <span className="text-xs text-muted-foreground">{formatDayKey(s.bestDay.day)}</span></span> : "—"],
    ["Worst day", s.worstDay ? <span key="w"><Pnl value={s.worstDay.netPnl} currency={ccy} /> <span className="text-xs text-muted-foreground">{formatDayKey(s.worstDay.day)}</span></span> : "—"],
    ["Average daily P&L", <Pnl key="adp" value={s.averageDailyPnl} currency={ccy} />],
  ];

  const c = s.consistency;
  const p = s.payout;
  const ruleRows: StatRow[] = [
    [
      "Consistency rule",
      c ? (
        <span key="c" className="inline-flex items-center gap-1">
          <ToneIcon tone={c.passes ? "profit" : "warning"} />
          {c.passes ? "Passing" : "Not satisfied"} · best day {c.ratioPct === null ? "—" : formatPct(c.ratioPct)} of profit (limit {formatPct(c.limitPct)})
        </span>
      ) : (
        "No rule"
      ),
      c?.profitNeeded ? `Total profit needed for the current best day to satisfy the rule: ${formatMoney(c.profitNeeded, ccy)}.` : undefined,
    ],
    [
      "Payout eligibility",
      <span key="pe" className="inline-flex items-center gap-1">
        <ToneIcon tone={p.eligible ? "profit" : "warning"} />
        {p.eligible ? "Eligible" : "Not yet eligible"}
      </span>,
      "Eligible when profit above the starting balance meets the threshold, the payout frequency has elapsed, minimum days are met and the consistency rule passes.",
    ],
    ["Eligible profit", formatMoney(p.eligibleProfit, ccy)],
    ["Estimated trader share", p.estimatedTraderShare === null ? "No profit split set" : formatMoney(p.estimatedTraderShare, ccy)],
    ["Payout threshold", p.threshold === null ? "None" : `${formatMoney(p.threshold, ccy)} · ${p.thresholdMet ? "met" : "not met"}`],
    [
      "Days since last payout",
      p.daysSinceLastPayout === null ? "—" : `${p.daysSinceLastPayout} d${p.frequencyDays !== null ? ` / every ${p.frequencyDays} d · ${p.frequencyMet ? "met" : "not met"}` : ""}`,
      "Counted from the last payout request, or from the account start before the first payout.",
    ],
  ];

  return (
    <div className="flex flex-col gap-5">
      <Section title="Balance vs drawdown floor" description="Closed-trade balance after every trade and payout withdrawal">
        <BalanceFloorChart points={points} startingBalance={s.startingBalance} targetBalance={s.profitTarget?.targetBalance ?? null} currency={ccy} timezone={tz} />
      </Section>

      <div className="grid gap-5 lg:grid-cols-2 2xl:grid-cols-3">
        <Section title="Balance & P&L" description={`In ${ccy}`}>
          <StatList rows={balanceRows} />
        </Section>
        <Section title="Drawdown & target">
          <StatList rows={ddRows} />
        </Section>
        <Section
          title="Trade statistics"
          description={sccy !== ccy ? `In ${sccy} (converted from ${ccy} with your Settings rates)` : `In ${sccy}`}
        >
          {ds.excluded.count > 0 ? (
            <p className="text-sm text-warning">
              {ds.excluded.count} trades in {ds.excluded.currencies.join(", ")} can&apos;t be converted to {sccy}. Add an exchange rate in Settings to see trade statistics.
            </p>
          ) : (
            <StatList rows={tradeRows} />
          )}
        </Section>
        <Section title="Trading days">
          <StatList rows={dayRows} />
        </Section>
        <Section title="Rules & payout eligibility">
          <StatList rows={ruleRows} />
        </Section>
        <Section title="Economics" description="Cash only: fees paid and payouts received">
          {fees.length ? (
            <ul className="-mt-1 mb-3 divide-y text-sm">
              {fees.map((f) => (
                <li key={f.id} className="flex items-center gap-2 py-1.5">
                  <div className="min-w-0 flex-1">
                    <div>{FEE_LABEL[f.type]}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatDate(f.paidAt, tz)}
                      {f.refunded ? ` · refunded ${formatMoney(f.refunded, f.currency)}` : ""}
                      {f.notes ? ` · ${f.notes}` : ""}
                    </div>
                  </div>
                  <span className="tabular text-loss">{formatMoney(-f.amount, f.currency)}</span>
                  <DeleteFeeButton id={f.id} label={FEE_LABEL[f.type]} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="mb-3 text-sm text-muted-foreground">No fees recorded. Add one from the Actions menu.</p>
          )}
          <StatList
            rows={[
              ["Fees (net of refunds)", e.fees ? formatMoney(-e.fees, ccy) : formatMoney(0, ccy)],
              ["Payouts received", <Pnl key="p" value={e.payouts} currency={ccy} />],
              ["Net cash flow", <Pnl key="n" value={e.netCashFlow} currency={ccy} className="font-semibold" />],
              ["ROI on fees", e.roiPct === null ? "—" : formatPct(e.roiPct, { sign: true }), "Net cash flow ÷ net fees."],
              ["Payout multiple", e.payoutMultiple === null ? "—" : `${formatRatio(e.payoutMultiple)}×`, "Payouts received ÷ net fees."],
            ]}
          />
          {fees.some((f) => f.currency !== ccy) && <p className="mt-2 text-xs text-warning">Some fees are in a different currency; account-level totals add them at face value.</p>}
        </Section>
      </div>
    </div>
  );
}
