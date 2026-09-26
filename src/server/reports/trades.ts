import "server-only";
import ExcelJS from "exceljs";
import { EMOTIONS, type Emotion } from "@/lib/calc/behavior";
import type { TradeFilters } from "@/lib/filters";
import { num, numOrNull } from "@/lib/num";
import { prisma } from "../db";
import { getPrefs } from "../queries/accounts";
import { statsOf, type StatsDTO } from "../queries/analytics";
import { loadDataset } from "../queries/dataset";
import { buildTradeWhere } from "../queries/trade-where";
import { toCsv } from "./csv";
import { zonedWallClock } from "./aggregations";
import { TRADE_COLUMNS, tradeRows, type ColumnKind, type TradeExportSource } from "./trade-columns";

/** Hard cap so a single export can't exhaust server memory. */
export const MAX_EXPORT_ROWS = 50_000;

export interface TradeExport {
  trades: TradeExportSource[];
  truncated: boolean;
  timezone: string;
  currency: string;
  summary: StatsDTO;
  summaryExcluded: { count: number; currencies: string[] };
  generatedAt: Date;
}

/** Every trade copy matching the filters (one row per account copy), plus summary stats. */
export async function loadTradeExport(userId: string, filters: TradeFilters): Promise<TradeExport> {
  const prefs = await getPrefs(userId);
  const where = buildTradeWhere(userId, filters, { timezone: prefs.timezone, tolerance: prefs.breakevenTolerance });
  const [rows, ds] = await Promise.all([
    prisma.trade.findMany({
      where,
      orderBy: [{ openedAt: "asc" }, { id: "asc" }],
      take: MAX_EXPORT_ROWS + 1,
      select: {
        id: true,
        groupId: true,
        status: true,
        openedAt: true,
        closedAt: true,
        symbol: true,
        direction: true,
        quantity: true,
        entryPrice: true,
        exitPrice: true,
        stopLoss: true,
        takeProfit: true,
        commission: true,
        swap: true,
        grossPnl: true,
        netPnl: true,
        initialRisk: true,
        riskPercent: true,
        rMultiple: true,
        plannedRR: true,
        setup: true,
        timeframe: true,
        grade: true,
        notes: true,
        account: { select: { name: true, currency: true, propFirm: { select: { name: true } } } },
        strategy: { select: { name: true } },
        session: { select: { name: true } },
        tags: { select: { tag: { select: { name: true } } } },
        journal: { select: { followedPlan: true, ...Object.fromEntries(EMOTIONS.map((e) => [e, true])) } as Record<string, true> },
      },
    }),
    // Summary uses the analytics pipeline without collapsing copies, matching the rows exported.
    loadDataset(userId, filters, { collapse: false }),
  ]);
  const truncated = rows.length > MAX_EXPORT_ROWS;
  const trades: TradeExportSource[] = rows.slice(0, MAX_EXPORT_ROWS).map((t) => {
    const j = t.journal as (Record<string, number | boolean | null> & { followedPlan: boolean | null }) | null;
    const emotions: Partial<Record<Emotion, number | null>> = {};
    if (j) for (const e of EMOTIONS) emotions[e] = (j[e] as number | null) ?? null;
    return {
      id: t.id,
      groupId: t.groupId,
      status: t.status,
      openedAt: t.openedAt,
      closedAt: t.closedAt,
      accountName: t.account.name,
      accountCurrency: t.account.currency,
      firmName: t.account.propFirm?.name ?? null,
      symbol: t.symbol,
      direction: t.direction,
      quantity: num(t.quantity),
      entryPrice: num(t.entryPrice),
      exitPrice: numOrNull(t.exitPrice),
      stopLoss: numOrNull(t.stopLoss),
      takeProfit: numOrNull(t.takeProfit),
      commission: num(t.commission),
      swap: num(t.swap),
      grossPnl: numOrNull(t.grossPnl),
      netPnl: numOrNull(t.netPnl),
      initialRisk: numOrNull(t.initialRisk),
      riskPercent: numOrNull(t.riskPercent),
      rMultiple: numOrNull(t.rMultiple),
      plannedRR: numOrNull(t.plannedRR),
      strategy: t.strategy?.name ?? null,
      setup: t.setup,
      session: t.session?.name ?? null,
      timeframe: t.timeframe,
      grade: t.grade,
      tags: t.tags.map((x) => x.tag.name),
      emotions,
      followedPlan: j?.followedPlan ?? null,
      notes: t.notes,
    };
  });
  return {
    trades,
    truncated,
    timezone: prefs.timezone,
    currency: prefs.currency,
    summary: statsOf(ds.trades, ds),
    summaryExcluded: ds.excluded,
    generatedAt: new Date(),
  };
}

export function tradesCsv(x: TradeExport): string {
  return toCsv(
    TRADE_COLUMNS.map((c) => c.header),
    tradeRows(x.trades, x.timezone),
  );
}

const NUM_FMT: Record<ColumnKind, string | undefined> = {
  text: undefined,
  datetime: "yyyy-mm-dd hh:mm",
  number: "#,##0.######",
  price: "0.00000###",
  money: "#,##0.00;[Red]-#,##0.00",
  pct: '0.00"%"',
  ratio: "0.00",
};

export async function tradesXlsx(x: TradeExport): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "PropTrack";
  wb.created = x.generatedAt;

  // ── Trades sheet ──
  const ws = wb.addWorksheet("Trades", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = TRADE_COLUMNS.map((c) => ({ header: c.header, width: c.width, style: NUM_FMT[c.kind] ? { numFmt: NUM_FMT[c.kind] } : {} }));
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8EAF0" } };
  for (const t of x.trades) {
    ws.addRow(
      TRADE_COLUMNS.map((c) => {
        if (c.kind === "datetime") {
          const d = c.header === "Opened" ? t.openedAt : t.closedAt;
          return d ? zonedWallClock(d, x.timezone) : null;
        }
        const v = c.value(t, x.timezone);
        return v === undefined || v === "" ? null : v;
      }),
    );
  }
  if (x.trades.length) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: TRADE_COLUMNS.length } };

  // ── Summary sheet ──
  const s = x.summary;
  const sum = wb.addWorksheet("Summary");
  sum.columns = [{ width: 34 }, { width: 18 }, { width: 60 }];
  const title = sum.addRow(["PropTrack trade report"]);
  title.font = { bold: true, size: 14 };
  sum.addRow(["Generated", zonedWallClock(x.generatedAt, x.timezone), `Times shown in ${x.timezone}`]).getCell(2).numFmt = "yyyy-mm-dd hh:mm";
  sum.addRow(["Rows exported", x.trades.length, x.truncated ? `Truncated at ${MAX_EXPORT_ROWS} rows — narrow the filters` : "One row per account copy"]);
  sum.addRow([]);
  const head = sum.addRow(["Closed-trade statistics", `Value (${x.currency})`, "Notes"]);
  head.font = { bold: true };
  const money = "#,##0.00;[Red]-#,##0.00";
  const items: [string, number | null, string, string?][] = [
    ["Closed trades", s.totalTrades, "0"],
    ["Wins", s.wins, "0"],
    ["Losses", s.losses, "0"],
    ["Break-even", s.breakevens, "0", "Within your break-even tolerance"],
    ["Win rate", s.winRate === null ? null : s.winRate / 100, "0.0%", "Wins ÷ (wins + losses); break-evens excluded"],
    ["Net P&L", s.netProfit, money, `Converted to ${x.currency} with your exchange rates`],
    ["Gross profit", s.grossProfit, money],
    ["Gross loss", -s.grossLoss, money],
    ["Commission", s.totalCommission, money],
    ["Swap", s.totalSwap, money],
    ["Profit factor", s.profitFactor, "0.00", "Gross profit ÷ gross loss"],
    ["Expectancy per trade", s.expectancy, money],
    ["Average winner", s.averageWinner, money],
    ["Average loser", s.averageLoser, money],
    ["Payoff ratio", s.payoffRatio, "0.00"],
    ["Trades with R", s.tradesWithR, "0", "Trades with a valid stop or explicit risk"],
    ["Average R", s.averageR, "0.00"],
    ["Total R", s.totalR, "0.00"],
    ["Max drawdown", s.maxDrawdown === 0 ? 0 : -Math.abs(s.maxDrawdown), money, "Closed-trade balance, peak to trough"],
    ["Max drawdown %", s.maxDrawdownPct === null ? null : -Math.abs(s.maxDrawdownPct) / 100, "0.00%"],
    ["Max consecutive wins", s.maxConsecutiveWins, "0"],
    ["Max consecutive losses", s.maxConsecutiveLosses, "0"],
  ];
  for (const [label, value, fmt, note] of items) {
    const r = sum.addRow([label, value, note ?? null]);
    r.getCell(2).numFmt = fmt;
  }
  if (x.summaryExcluded.count > 0) {
    sum.addRow([]);
    sum.addRow([`${x.summaryExcluded.count} trades in ${x.summaryExcluded.currencies.join(", ")} are excluded from the statistics (no exchange rate to ${x.currency}). They are still listed on the Trades sheet in their own currency.`]);
  }
  sum.addRow([]);
  sum.addRow(["Trades sheet money columns are in each account's own currency (see the Currency column). Open trades appear only when the Status filter includes them."]);

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf as ArrayBuffer);
}
