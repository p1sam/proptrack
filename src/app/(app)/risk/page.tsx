import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { requireUser } from "@/server/session";
import { getRiskPage, type RiskPageData } from "@/server/queries/risk";
import { parseTradeFilters } from "@/lib/filters";
import { formatDayKey, formatMoney, formatNumber, formatPct, formatR } from "@/lib/format";
import { PageHeader, Section } from "@/components/app/page-header";
import { StatCard, StatGrid } from "@/components/app/stat-card";
import { Pnl, PctValue, RValue } from "@/components/app/pnl";
import { EmptyState } from "@/components/app/empty-state";
import { FilterBar } from "@/components/filters/filter-bar";
import { DatasetNotesBar } from "@/components/analytics/dataset-notes";
import { BarBreakdown } from "@/components/charts/bar-breakdown";
import { ColumnChart } from "@/components/charts/column-chart";
import { DailyRiskChart, RiskHistogram } from "@/components/risk/risk-charts";
import { EmotionTable, NeedsMore, QuestionCard, RuleChecks, SubsetTable } from "@/components/risk/risk-parts";

export const metadata = { title: "Risk & discipline" };

export default async function RiskPage(props: PageProps<"/risk">) {
  const user = await requireUser();
  const sp = await props.searchParams;
  const filters = parseTradeFilters(sp);
  const d = await getRiskPage(user.id, filters);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Risk & discipline" description="How much you risk, and how your trading changes after losses — computed from the filtered set of closed trades." />
      <FilterBar options={d.filterOptions} />
      <DatasetNotesBar notes={d.notes} extra={<span>Rule-break counts use the account and date filters only.</span>} />
      {d.sample === 0 ? (
        <EmptyState icon={<ShieldAlert />} title="No closed trades match these filters" description="Widen the date range or clear filters to see risk and discipline metrics." />
      ) : (
        <>
          <RiskSection d={d} />
          <DisciplineSection d={d} />
        </>
      )}
    </div>
  );
}

type P = { d: RiskPageData };

function RiskSection({ d }: P) {
  const r = d.risk;
  const ccy = d.currency;
  const limitLabel = r.limit !== null ? `${formatNumber(r.limit, 2)}%` : null;
  const over = r.overLimit;
  const coverage = `${r.withRiskPct} of ${r.trades} trades have a risk %`;
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-base font-semibold">Risk</h2>
      <StatGrid>
        <StatCard label="Avg risk % / trade" value={formatPct(r.avgRiskPct)} sub={coverage} hint="Initial risk as % of the account balance when the trade was opened. Trades without a stop have no risk figure and are left out." />
        <StatCard
          label="Max risk % / trade"
          value={formatPct(r.maxRiskPct)}
          tone={r.limit !== null && r.maxRiskPct !== null && r.maxRiskPct > r.limit ? "warning" : undefined}
          sub={limitLabel ? `Limit ${limitLabel} (${r.limitSource === "rule" ? "rule" : "settings"})` : "No limit set"}
        />
        <StatCard label="Avg risk amount / trade" value={formatMoney(r.avgRiskAmount, ccy)} sub={`${r.withRiskAmount} trades with a stop`} hint="Initial risk = |entry − stop| × quantity × point value, in your display currency." />
        <StatCard label="Max risk amount / trade" value={formatMoney(r.maxRiskAmount, ccy)} />
        <StatCard label="Avg daily risk" value={formatMoney(r.avgDailyRisk, ccy)} sub={`${d.tradesPerDay.tradingDays} trading days`} hint="Sum of the initial risk of every trade opened that trading day, averaged over trading days." />
        <StatCard label="Max daily risk" value={formatMoney(r.maxDailyRisk, ccy)} sub={r.maxDailyRiskDay ? formatDayKey(r.maxDailyRiskDay, { month: "short", day: "numeric", year: "numeric" }) : undefined} />
        <StatCard label="Trades / day" value={formatNumber(d.tradesPerDay.avgTradesPerDay, 1)} sub={`Max ${d.tradesPerDay.maxTradesInDay} in a day`} hint="Average number of trades opened per trading day (days with no trades are not counted)." />
        <StatCard
          label="Current drawdown"
          value={d.drawdown.current ? formatMoney(-d.drawdown.current, ccy) : formatMoney(0, ccy)}
          tone={d.drawdown.current ? "loss" : undefined}
          sub={d.drawdown.currentPct !== null ? `${formatPct(-d.drawdown.currentPct)} · max ${formatMoney(-d.drawdown.max, ccy)}` : `Max ${formatMoney(-d.drawdown.max, ccy)}`}
          hint="Distance of the closed-trade equity curve below its running peak. Floating equity is not known to the journal."
        />
        <StatCard label="Current loss streak" value={d.streaks.currentLossStreak} tone={d.streaks.currentLossStreak >= 3 ? "warning" : undefined} sub={d.streaks.currentLossStreak >= 3 ? "3 or more losses in a row" : undefined} hint="Consecutive losing trades up to the most recent one. Break-even trades end a streak." />
        <StatCard label="Max consecutive losses" value={d.streaks.maxConsecutiveLosses} />
        <StatCard
          label="Over risk limit"
          value={over ? `${over.exceeded} of ${over.measured}` : "—"}
          tone={over && over.exceeded > 0 ? "warning" : undefined}
          sub={over ? (over.exceeded ? `${formatPct(over.pct)} of measured trades` : `All within ${limitLabel}`) : "Set a risk % in Settings or Rules"}
        />
      </StatGrid>

      <Section title="Your rules" description="Active personal rules for the selected accounts, checked against these trades and the stored rule-break log.">
        <RuleChecks rules={d.ruleChecks} />
      </Section>

      <div className="grid gap-3 lg:grid-cols-2">
        <Section
          title="Risk per trade"
          description={
            over && limitLabel
              ? `${over.exceeded} of ${over.measured} trades exceeded ${limitLabel}.`
              : `Distribution of risk % across ${r.withRiskPct} trades.`
          }
        >
          <RiskHistogram data={r.histogram.map((b) => ({ label: b.label, count: b.count, overLimit: b.overLimit }))} limitLabel={limitLabel} />
        </Section>
        <Section title="Daily risk" description="Sum of initial risk of the trades opened each trading day.">
          <DailyRiskChart data={r.daily} currency={ccy} />
        </Section>
      </div>
    </div>
  );
}

function DisciplineSection({ d }: P) {
  const ccy = d.currency;
  const s = d.sequences;
  const base = s.baseline;
  const enough = d.needed === 0;
  const tpd = d.tradesPerDay;
  const sizing = d.sizing;
  const vt = d.violationTotals;
  const gate = (n: number, what = "trade") => (n < d.minGroup ? <NeedsMore n={d.minGroup - n} what={what} /> : null);

  // Overtrading answer
  let overAnswer: React.ReactNode = null;
  let overTone: "warning" | "ok" | undefined;
  if (d.maxTradesPerDay === null) {
    overAnswer = (
      <>
        No max trades per day is set.{" "}
        <Link href="/rules" className="underline-offset-2 hover:underline">
          Add a rule
        </Link>{" "}
        to compare days over it.
      </>
    );
  } else if (tpd.overLimit && tpd.withinLimit) {
    const o = tpd.overLimit;
    const w = tpd.withinLimit;
    if (o.days === 0) {
      overAnswer = `No day went over ${d.maxTradesPerDay} trades (${d.maxTradesSource === "rule" ? "your rule" : "your settings"}).`;
      overTone = "ok";
    } else {
      overAnswer = (
        <>
          {o.days} of {tpd.tradingDays} days went over {d.maxTradesPerDay} trades. Those days averaged <Pnl value={o.avgDayPnl} currency={ccy} /> vs <Pnl value={w.avgDayPnl} currency={ccy} /> on other days.
        </>
      );
      overTone = o.avgDayPnl !== null && w.avgDayPnl !== null && o.avgDayPnl < w.avgDayPnl ? "warning" : undefined;
    }
  }

  // Sizing answer
  const sizingWorse = sizing.increasedAfterLossPct !== null && sizing.increasedAfterLossPct >= 30 && (sizing.increasedAfterWinPct === null || sizing.increasedAfterLossPct > sizing.increasedAfterWinPct);

  // After-loss answer
  const twoWorse = s.afterTwoLosses.n >= d.minGroup && s.afterTwoLosses.winRate !== null && base.winRate !== null && s.afterTwoLosses.winRate < base.winRate;

  const worstMistake = d.mistakes[0];
  const emotionRated = d.emotions.length > 0;
  const strongEmotion = d.emotions.filter((e) => e.n >= d.minTrades && e.correlationWithR !== null && Math.abs(e.correlationWithR) >= 0.3);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold">Discipline</h2>
        {!enough && <NeedsMore n={d.needed} className="text-xs" />}
      </div>
      {!enough && (
        <p className="text-sm text-muted-foreground">
          Behavioural statements need at least {d.minTrades} trades in the set (change this in Settings). The numbers below are shown for reference; subgroups under {d.minGroup} trades are hidden.
        </p>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        <QuestionCard title="Am I overtrading?" answer={overAnswer} tone={overTone}>
          <ColumnChart
            kind="money"
            currency={ccy}
            valueLabel="avg day P&L"
            height={200}
            data={tpd.byCount.map((b) => ({
              key: b.label,
              label: b.label,
              value: b.avgDayPnl ?? 0,
              details: [
                { label: "days", value: formatNumber(b.days, 0) },
                { label: "net P&L", value: formatMoney(b.netPnl, ccy, { sign: true }) },
                { label: "win rate", value: formatPct(b.winRate) },
                { label: "avg R", value: formatR(b.averageR) },
              ],
            }))}
          />
          <p className="text-xs text-muted-foreground">Average day P&amp;L by number of trades taken that day · {tpd.tradingDays} trading days.</p>
        </QuestionCard>

        <QuestionCard
          title="Do I increase risk after losses?"
          tone={enough && sizing.pairsAfterLoss >= d.minGroup ? (sizingWorse ? "warning" : "ok") : undefined}
          answer={
            enough && sizing.pairsAfterLoss >= d.minGroup && sizing.increasedAfterLossPct !== null
              ? `You raised risk by more than 10% on ${formatPct(sizing.increasedAfterLossPct, { dp: 0 })} of trades that followed a loss${sizing.increasedAfterWinPct !== null ? ` (after wins: ${formatPct(sizing.increasedAfterWinPct, { dp: 0 })})` : ""}.`
              : null
          }
        >
          {sizing.pairsAfterLoss < d.minGroup ? (
            gate(sizing.pairsAfterLoss, "trade after a loss")
          ) : (
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">After a loss · {sizing.pairsAfterLoss} trades</dt>
                <dd className="tabular">
                  Avg risk change <PctValue value={sizing.avgRiskChangeAfterLossPct} />
                </dd>
                <dd className="text-xs text-muted-foreground tabular">{formatPct(sizing.increasedAfterLossPct, { dp: 0 })} sized up &gt;10%</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">After a win · {sizing.pairsAfterWin} trades</dt>
                <dd className="tabular">
                  Avg risk change <PctValue value={sizing.avgRiskChangeAfterWinPct} />
                </dd>
                <dd className="text-xs text-muted-foreground tabular">{formatPct(sizing.increasedAfterWinPct, { dp: 0 })} sized up &gt;10%</dd>
              </div>
            </dl>
          )}
          <p className="text-xs text-muted-foreground">Compares each trade&apos;s risk with the previous trade the same day (risk % when known, otherwise money).</p>
        </QuestionCard>

        <QuestionCard
          title="What happens after I take a loss?"
          tone={enough && twoWorse ? "warning" : undefined}
          answer={
            enough && s.afterTwoLosses.n >= d.minGroup && s.afterTwoLosses.winRate !== null
              ? `After 2 consecutive losses your win rate is ${formatPct(s.afterTwoLosses.winRate, { dp: 0 })} (overall ${formatPct(base.winRate, { dp: 0 })}).`
              : null
          }
        >
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs text-muted-foreground">More trades after a loss</dt>
              <dd className="tabular">{s.losingTrades >= d.minGroup ? formatNumber(s.avgTradesAfterLoss, 1) : gate(s.losingTrades, "losing trade")}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Avg R after first loss of day</dt>
              <dd>{s.afterFirstLossOfDay.n >= d.minGroup ? <RValue value={s.afterFirstLossOfDay.averageR} /> : gate(s.afterFirstLossOfDay.n)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Re-entries within {d.rapid.minutes} min of a loss</dt>
              <dd className="tabular">
                {d.rapid.rapidAfterLoss.n}
                {d.rapid.rapidAfterLoss.n >= d.minGroup && (
                  <span className="text-xs text-muted-foreground">
                    {" "}
                    · avg <RValue value={d.rapid.rapidAfterLoss.averageR} />
                  </span>
                )}
              </dd>
            </div>
          </dl>
          <SubsetTable
            currency={ccy}
            minGroup={d.minGroup}
            rows={[
              { key: "all", label: "All trades", s: base },
              { key: "loss", label: "After a loss", s: s.afterLoss },
              { key: "win", label: "After a win", s: s.afterWin },
              { key: "two", label: "After 2 losses in a row", s: s.afterTwoLosses },
              { key: "first", label: "After first loss of day", s: s.afterFirstLossOfDay },
              { key: "rapid", label: `Within ${d.rapid.minutes} min of a loss`, s: d.rapid.rapidAfterLoss },
            ]}
          />
          <p className="text-xs text-muted-foreground">Sequences are evaluated within a trading day, in open-time order, across accounts.</p>
        </QuestionCard>

        <QuestionCard
          title="Which mistakes cost me the most?"
          tone={worstMistake && worstMistake.netPnl < 0 ? "warning" : undefined}
          answer={
            worstMistake && worstMistake.netPnl < 0 ? (
              <>
                “{worstMistake.label}” cost <Pnl value={worstMistake.netPnl} currency={ccy} /> over {worstMistake.trades} trade{worstMistake.trades === 1 ? "" : "s"}.
              </>
            ) : null
          }
        >
          {d.mistakes.length ? (
            <BarBreakdown rows={d.mistakes} currency={ccy} />
          ) : (
            <p className="text-sm text-muted-foreground">
              No trades tagged with a mistake tag.{" "}
              <Link href="/settings?tab=tags" className="text-foreground underline-offset-2 hover:underline">
                Mark tags as mistakes
              </Link>{" "}
              and tag trades to see their cost.
            </p>
          )}
        </QuestionCard>

        <QuestionCard
          title="Do I trade outside my hours?"
          tone={d.outsideHours ? (vt.tradingHours > 0 ? "warning" : "ok") : undefined}
          answer={
            d.outsideHours
              ? vt.tradingHours > 0
                ? `${d.outsideHours.outside.n} trade${d.outsideHours.outside.n === 1 ? " was" : "s were"} opened outside your trading hours.`
                : "Every trade was opened inside your trading hours."
              : null
          }
        >
          {d.outsideHours ? (
            <SubsetTable
              currency={ccy}
              minGroup={d.minGroup}
              rows={[
                { key: "in", label: "Inside hours", s: d.outsideHours.inside },
                { key: "out", label: "Outside hours", s: d.outsideHours.outside },
              ]}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              No trading-hours rule.{" "}
              <Link href="/rules" className="text-foreground underline-offset-2 hover:underline">
                Define your hours
              </Link>{" "}
              to track trades outside them.
            </p>
          )}
        </QuestionCard>

        <QuestionCard
          title="Did I break a daily loss limit?"
          tone={vt.dailyLossDays > 0 ? "warning" : "ok"}
          answer={
            vt.dailyLossDays > 0
              ? `Daily loss limit broken on ${vt.dailyLossDays} account-day${vt.dailyLossDays === 1 ? "" : "s"} in this period.`
              : "No daily loss limit was broken in this period."
          }
        >
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">Prop-firm rule</dt>
              <dd className="tabular">{vt.dailyLossProp} day{vt.dailyLossProp === 1 ? "" : "s"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Personal rule</dt>
              <dd className="tabular">{d.hasDailyLossRule ? `${vt.dailyLossPersonal} day${vt.dailyLossPersonal === 1 ? "" : "s"}` : "No rule set"}</dd>
            </div>
          </dl>
          <p className="text-xs text-muted-foreground">
            Evaluated per account on closed-trade balance.{" "}
            <Link href="/rules" className="text-foreground underline-offset-2 hover:underline">
              See all rule breaks
            </Link>
          </p>
        </QuestionCard>

        <QuestionCard
          title="Do my emotions affect my results?"
          className="lg:col-span-2"
          answer={
            enough && strongEmotion.length
              ? strongEmotion
                  .map((e) => `${e.emotion[0].toUpperCase()}${e.emotion.slice(1)} ratings show a ${e.correlationWithR! > 0 ? "positive" : "negative"} correlation with R (r = ${formatNumber(e.correlationWithR, 2)}, n = ${e.n}).`)
                  .join(" ")
              : null
          }
        >
          {emotionRated ? (
            <>
              <EmotionTable emotions={d.emotions} minTrades={d.minTrades} />
              <p className="text-xs text-muted-foreground">Average R by rating (1–5) with trade count in brackets; r is the Pearson correlation between rating and R, shown from {d.minTrades} rated trades.</p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">No trades in this set have emotion ratings. Rate emotions in the trade journal to see how they relate to R.</p>
          )}
        </QuestionCard>
      </div>

      {enough && d.insights.length > 0 && (
        <Section title="What the data says" description={`Descriptive statements from ${d.sample} trades; each needs at least ${d.minGroup} trades in its group.`}>
          <ul className="flex flex-col gap-2 text-sm">
            {d.insights.map((i) => (
              <li key={i.id} className="flex items-start justify-between gap-3">
                <span>{i.text}</span>
                <span className="shrink-0 text-xs text-muted-foreground tabular">n = {i.sample}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}
