import "server-only";
import { renderToBuffer, Text, View } from "@react-pdf/renderer";
import { formatDateTime, formatDayKey, formatMoney, formatMonthKey, formatPct, formatR, formatRatio, humanize } from "@/lib/format";
import type { GroupStats } from "@/lib/calc/stats";
import type { MonthlyReport } from "./monthly";
import { H2, KpiGrid, Note, ReportDocument, s, Table, type Cell } from "./pdf-kit";

function groupRows(rows: GroupStats[], ccy: string): Cell[][] {
  return rows.map((g) => [
    g.label,
    String(g.trades),
    formatPct(g.winRate),
    { text: formatMoney(g.netPnl, ccy, { sign: true }), tone: g.netPnl },
    formatR(g.averageR),
    g.profitFactor === null ? "—" : formatRatio(g.profitFactor),
  ]);
}

const GROUP_COLS = (label: string) => [
  { label, flex: 2.4 },
  { label: "Trades", align: "right" as const },
  { label: "Win rate", align: "right" as const },
  { label: "Net P&L", flex: 1.4, align: "right" as const },
  { label: "Avg R", align: "right" as const },
  { label: "PF", align: "right" as const },
];

function MonthlyDocument({ r, filterNote }: { r: MonthlyReport; filterNote: string | null }) {
  const ccy = r.currency;
  const st = r.stats;
  const meta = `${formatMonthKey(r.month)} · generated ${formatDateTime(r.generatedAt, r.timezone)} (${r.timezone})`;
  const p = r.psychology;
  return (
    <ReportDocument title="Monthly performance report" meta={meta}>
      <Text style={s.title}>{formatMonthKey(r.month)}</Text>
      <Text style={s.subtitle}>
        Monthly performance report · {r.from} to {r.to} · amounts in {ccy}
      </Text>

      <KpiGrid
        items={[
          { label: "Net P&L", value: formatMoney(st.netProfit, ccy, { sign: true }), tone: st.netProfit, sub: `${st.totalTrades} trades` },
          { label: "Win rate", value: formatPct(st.winRate), sub: `${st.wins}W / ${st.losses}L / ${st.breakevens} BE` },
          { label: "Profit factor", value: st.profitFactor === null ? "—" : formatRatio(st.profitFactor), sub: "Gross profit / gross loss" },
          { label: "Max drawdown", value: formatMoney(st.maxDrawdown ? -Math.abs(st.maxDrawdown) : 0, ccy), sub: st.maxDrawdownPct === null ? "Closed-trade balance" : formatPct(-Math.abs(st.maxDrawdownPct)), tone: st.maxDrawdown ? -1 : 0 },
          { label: "Expectancy", value: formatMoney(st.expectancy, ccy, { sign: true }), tone: st.expectancy, sub: "Per trade" },
          { label: "Average R", value: formatR(st.averageR), sub: `${st.tradesWithR} trades with R`, tone: st.averageR },
          { label: "Best day", value: r.daySummary.bestDay ? formatMoney(r.daySummary.bestDay.pnl, ccy, { sign: true }) : "—", sub: r.daySummary.bestDay ? formatDayKey(r.daySummary.bestDay.day) : undefined, tone: r.daySummary.bestDay?.pnl },
          { label: "Worst day", value: r.daySummary.worstDay ? formatMoney(r.daySummary.worstDay.pnl, ccy, { sign: true }) : "—", sub: r.daySummary.worstDay ? formatDayKey(r.daySummary.worstDay.day) : undefined, tone: r.daySummary.worstDay?.pnl },
        ]}
      />
      <Note>
        {`${r.daySummary.winningDays} winning and ${r.daySummary.losingDays} losing days. Commission ${formatMoney(st.totalCommission, ccy)}, swap ${formatMoney(st.totalSwap, ccy, { sign: true })}.${r.collapsed ? ` ${r.rawCount} account copies were collapsed into ${st.totalTrades} trade ideas for trade counts and rates; money sums every copy.` : ""}`}
      </Note>
      {filterNote ? <Note>{`Filters applied: ${filterNote}`}</Note> : null}
      {r.excluded.count > 0 ? <Note>{`${r.excluded.count} trades in ${r.excluded.currencies.join(", ")} are excluded — no exchange rate to ${ccy} in Settings.`}</Note> : null}

      <H2>Accounts included</H2>
      <Table
        cols={[{ label: "Account", flex: 2.5 }, { label: "Prop firm", flex: 2 }, { label: "Closed trades", align: "right" }]}
        rows={r.accounts.map((a) => [a.name, a.firm ?? "—", String(a.trades)])}
        empty="No closed trades in this month."
      />

      <H2>By strategy</H2>
      <Table cols={GROUP_COLS("Strategy")} rows={groupRows(r.strategies, ccy)} />

      <H2>By instrument</H2>
      <Table cols={GROUP_COLS("Instrument")} rows={groupRows(r.instruments, ccy)} />

      <View wrap={false}>
      <H2>Psychology</H2>
      <View style={{ flexDirection: "row", gap: 14 }}>
        <View style={{ flex: 1 }}>
          <Table
            cols={[{ label: "Emotion", flex: 1.6 }, { label: "Avg (1-5)", align: "right" }, { label: "Rated", align: "right" }]}
            rows={p.emotions.map((e) => [humanize(e.emotion), e.average === null ? "—" : e.average.toFixed(2), String(e.n)])}
          />
        </View>
        <View style={{ flex: 1.3 }}>
          <Table
            cols={[{ label: "Mistake tag (by cost)", flex: 2 }, { label: "Trades", align: "right" }, { label: "Net P&L", flex: 1.3, align: "right" }]}
            rows={p.mistakes.map((m) => [m.label, String(m.trades), { text: formatMoney(m.netPnl, ccy, { sign: true }), tone: m.netPnl }])}
            empty="No mistake tags this month."
          />
          <Text style={[s.small, { marginTop: 6 }]}>
            {`Followed plan: ${p.followedPlan.pct === null ? "not journaled" : `${formatPct(p.followedPlan.pct)} (${p.followedPlan.followed} of ${p.followedPlan.answered} journaled trades)`}.`}
          </Text>
          <Text style={s.small}>
            {`After a loss: ${p.afterLoss.n} trades, win rate ${formatPct(p.afterLoss.winRate)}, avg R ${formatR(p.afterLoss.averageR)} (baseline ${formatPct(p.baseline.winRate)}, ${formatR(p.baseline.averageR)}).`}
          </Text>
        </View>
      </View>
      </View>
      {r.insights.length > 0 ? (
        <View style={{ marginTop: 8 }}>
          {r.insights.map((i) => (
            <Text key={i.id} style={s.para}>{`• ${i.text} (n = ${i.sample})`}</Text>
          ))}
        </View>
      ) : (
        <Note>{`Pattern statements appear once at least ${r.minTrades} closed trades back them (${st.totalTrades} this month).`}</Note>
      )}

      <H2>Daily performance</H2>
      <Table
        cols={[
          { label: "Day", flex: 1.6 },
          { label: "Trades", align: "right" },
          { label: "W / L", align: "right" },
          { label: "Win rate", align: "right" },
          { label: "R", align: "right" },
          { label: "Net P&L", flex: 1.4, align: "right" },
          { label: "Cumulative", flex: 1.4, align: "right" },
        ]}
        rows={r.daily.map((d) => [
          formatDayKey(d.day, { weekday: "short", month: "short", day: "numeric" }),
          String(d.trades),
          `${d.wins} / ${d.losses}`,
          formatPct(d.winRate),
          formatR(d.rTotal),
          { text: formatMoney(d.pnl, ccy, { sign: true }), tone: d.pnl },
          { text: formatMoney(d.cumPnl, ccy, { sign: true }), tone: d.cumPnl },
        ])}
        total={r.daily.length ? ["Month", String(r.daySummary.totalTrades), `${st.wins} / ${st.losses}`, formatPct(st.winRate), formatR(st.totalR), { text: formatMoney(st.netProfit, ccy, { sign: true }), tone: st.netProfit }, ""] : undefined}
        empty="No trading days this month."
      />

      <H2>Definitions</H2>
      <Note>
        {`Net P&L = gross P&L − commission + swap, on closed trades only. Days are bucketed by close time in ${r.timezone}. Win rate = wins ÷ (wins + losses); trades within your break-even tolerance are excluded. Profit factor = gross profit ÷ gross loss. R = net P&L ÷ initial risk (|entry − stop| × quantity × point value); trades without a stop have no R.`}
      </Note>
      <Note>
        {`Drawdown is measured on the closed-trade balance of the included accounts (starting capital ${formatMoney(r.startingCapital, ccy)}) — floating equity is not known to the journal. Accounts in other currencies are converted to ${ccy} with the exchange rates in Settings; trades without a rate are excluded and disclosed above, never summed unconverted.`}
      </Note>
      <Note>
        {"Copies of one trade idea on several accounts count once for trade counts, win rate and R, while money totals include every copy. Emotion ratings are the 1–5 scores from trade journals; mistake-tag cost is the net P&L of trades carrying the tag."}
      </Note>
    </ReportDocument>
  );
}

export function renderMonthlyPdf(r: MonthlyReport, filterNote: string | null): Promise<Buffer> {
  return renderToBuffer(<MonthlyDocument r={r} filterNote={filterNote} />);
}
