import "server-only";
import { renderToBuffer, Text } from "@react-pdf/renderer";
import { formatDate, formatDateTime, formatMoney, formatPct, formatRatio } from "@/lib/format";
import { PASS_RATE_DEFINITION, type PropFirmReport } from "./prop-firms";
import { H2, KpiGrid, Note, ReportDocument, s, Table } from "./pdf-kit";

function PropFirmDocument({ r, filterNote }: { r: PropFirmReport; filterNote: string | null }) {
  const c = r.currency;
  const p = r.portfolio;
  const m = (v: number | null, sign = false) => formatMoney(v, c, { sign });
  const meta = `Generated ${formatDateTime(r.generatedAt, r.timezone)} (${r.timezone})`;
  return (
    <ReportDocument title="Prop-firm report" meta={meta}>
      <Text style={s.title}>Prop-firm report</Text>
      <Text style={s.subtitle}>Fees, payouts and outcomes across {r.counts.total} accounts · amounts in {c} · all time</Text>

      <KpiGrid
        items={[
          { label: "Net cash flow", value: m(p.netCashFlow, true), tone: p.netCashFlow, sub: "Payouts − fees" },
          { label: "Fees paid", value: m(p.totalFees), sub: "Net of refunds" },
          { label: "Payouts received", value: m(p.totalPayouts), sub: `${r.payouts.filter((x) => x.paid).length} paid` },
          { label: "ROI on fees", value: formatPct(p.roiPct, { sign: true }), tone: p.roiPct, sub: "Net cash flow ÷ fees" },
          { label: "Payout multiple", value: p.payoutMultiple === null ? "—" : `${formatRatio(p.payoutMultiple)}x`, sub: "Payouts ÷ fees" },
          { label: "Pass rate", value: formatPct(r.counts.passRate), sub: `${r.counts.passed} passed / ${r.counts.failed} failed` },
          { label: "Accounts purchased", value: String(r.counts.purchased), sub: `${r.counts.total} accounts total` },
          { label: "Funded", value: String(r.counts.funded), sub: `${r.counts.breached} breached · ${r.counts.inProgress} in progress` },
        ]}
      />
      {filterNote ? <Note>{`Filters applied: ${filterNote}`}</Note> : null}
      {p.missingCurrencies.length ? <Note>{`Missing exchange rate to ${c} for ${p.missingCurrencies.join(", ")} — those amounts are excluded from totals.`}</Note> : null}

      <H2>Fees by type</H2>
      <Table
        cols={[{ label: "Type", flex: 2 }, { label: "Count", align: "right" }, { label: "Total", flex: 1.4, align: "right" }]}
        rows={r.feesByType.map((f) => [f.label, String(f.count), m(f.total)])}
        total={r.feesByType.length ? ["Total", String(r.feesByType.reduce((a, f) => a + f.count, 0)), m(p.totalFees)] : undefined}
        empty="No fees recorded."
      />

      <H2>By prop firm</H2>
      <Table
        cols={[
          { label: "Firm", flex: 2.2 },
          { label: "Accts", align: "right", flex: 0.7 },
          { label: "Passed", align: "right", flex: 0.8 },
          { label: "Failed", align: "right", flex: 0.8 },
          { label: "Pass rate", align: "right" },
          { label: "Fees", align: "right", flex: 1.3 },
          { label: "Payouts", align: "right", flex: 1.3 },
          { label: "Net", align: "right", flex: 1.3 },
          { label: "ROI", align: "right" },
        ]}
        rows={r.firms.map((f) => [
          f.firmName,
          String(f.accounts),
          String(f.passed),
          String(f.failed),
          formatPct(f.passRate),
          m(f.fees),
          m(f.payouts),
          { text: m(f.netCashFlow, true), tone: f.netCashFlow },
          { text: formatPct(f.roiPct, { sign: true }), tone: f.roiPct },
        ])}
      />

      <H2>By account</H2>
      <Table
        cols={[
          { label: "Account", flex: 2.4 },
          { label: "Firm", flex: 1.6 },
          { label: "Status", flex: 1.1 },
          { label: "Fees", align: "right", flex: 1.2 },
          { label: "Payouts", align: "right", flex: 1.2 },
          { label: "Net", align: "right", flex: 1.2 },
          { label: "Trading P&L", align: "right", flex: 1.3 },
        ]}
        rows={r.accounts.map((a) => [
          a.name,
          a.firm ?? "—",
          a.status,
          m(a.fees),
          m(a.payouts),
          { text: m(a.netCashFlow, true), tone: a.netCashFlow },
          { text: m(a.tradingPnl, true), tone: a.tradingPnl },
        ])}
        total={r.accounts.length ? ["Total", "", "", m(p.totalFees), m(p.totalPayouts), { text: m(p.netCashFlow, true), tone: p.netCashFlow }, { text: m(p.tradingPnl, true), tone: p.tradingPnl }] : undefined}
        empty="No accounts."
      />

      <H2>Payouts</H2>
      <Table
        cols={[
          { label: "Account", flex: 2.2 },
          { label: "Status", flex: 1 },
          { label: "Requested", flex: 1.2 },
          { label: "Paid", flex: 1.2 },
          { label: "Requested amt", align: "right", flex: 1.3 },
          { label: "Received", align: "right", flex: 1.3 },
        ]}
        rows={r.payouts.map((x) => [
          x.firm ? `${x.account} (${x.firm})` : x.account,
          x.status,
          formatDate(x.requestedAt, r.timezone),
          formatDate(x.paidAt, r.timezone),
          formatMoney(x.amountRequested, x.currency),
          x.amountReceived === null ? "—" : formatMoney(x.amountReceived, x.currency),
        ])}
        empty="No payouts recorded."
      />

      <H2>Definitions</H2>
      <Note>{"Cash view: only fees paid (net of refunds) and payouts received with status Paid count as money in or out. Account sizes, balances and trading P&L are not cash; trading P&L is shown for context only."}</Note>
      <Note>{"Net cash flow = payouts received − fees paid. ROI on fees = net cash flow ÷ fees × 100. Payout multiple = payouts received ÷ fees."}</Note>
      <Note>{PASS_RATE_DEFINITION}</Note>
      <Note>{"Accounts purchased = accounts with a purchase date or a challenge fee recorded. Payout amounts in the payout list are in the payout's own currency."}</Note>
      <Note>{`Totals are converted to ${c} with the exchange rates in Settings; anything without a rate is excluded and disclosed, never summed unconverted.`}</Note>
    </ReportDocument>
  );
}

export function renderPropFirmPdf(r: PropFirmReport, filterNote: string | null): Promise<Buffer> {
  return renderToBuffer(<PropFirmDocument r={r} filterNote={filterNote} />);
}
