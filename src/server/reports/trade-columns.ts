/**
 * Column model of the trade export (CSV + Excel). Pure: takes plain rows, no I/O.
 * One row per trade *copy* — copies of the same idea on several accounts are separate rows
 * linked by the Group ID column, so money totals per account are exact.
 */
import { EMOTIONS, type Emotion } from "@/lib/calc/behavior";
import type { CsvValue } from "./csv";
import { zonedStamp } from "./aggregations";

export interface TradeExportSource {
  id: string;
  groupId: string | null;
  status: string;
  openedAt: Date;
  closedAt: Date | null;
  accountName: string;
  accountCurrency: string;
  firmName: string | null;
  symbol: string;
  direction: string;
  quantity: number;
  entryPrice: number;
  exitPrice: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  commission: number;
  swap: number;
  grossPnl: number | null;
  netPnl: number | null;
  initialRisk: number | null;
  riskPercent: number | null;
  rMultiple: number | null;
  plannedRR: number | null;
  strategy: string | null;
  setup: string | null;
  session: string | null;
  timeframe: string | null;
  grade: string | null;
  tags: string[];
  emotions: Partial<Record<Emotion, number | null>>;
  followedPlan: boolean | null;
  notes: string | null;
}

export type ColumnKind = "text" | "datetime" | "number" | "price" | "money" | "pct" | "ratio";

export interface ExportColumn {
  header: string;
  kind: ColumnKind;
  width: number;
  value: (t: TradeExportSource, tz: string) => CsvValue;
}

const GRADE_LABEL: Record<string, string> = { A_PLUS: "A+", A: "A", B: "B", C: "C", D: "D", F: "F" };

export function emotionsText(e: Partial<Record<Emotion, number | null>>): string {
  return EMOTIONS.filter((k) => typeof e[k] === "number")
    .map((k) => `${k} ${e[k]}`)
    .join("; ");
}

export const TRADE_COLUMNS: ExportColumn[] = [
  { header: "Trade ID", kind: "text", width: 26, value: (t) => t.id },
  { header: "Group ID", kind: "text", width: 26, value: (t) => t.groupId },
  { header: "Opened", kind: "datetime", width: 17, value: (t, tz) => zonedStamp(t.openedAt, tz) },
  { header: "Closed", kind: "datetime", width: 17, value: (t, tz) => zonedStamp(t.closedAt, tz) },
  { header: "Status", kind: "text", width: 8, value: (t) => t.status },
  { header: "Account", kind: "text", width: 22, value: (t) => t.accountName },
  { header: "Currency", kind: "text", width: 9, value: (t) => t.accountCurrency },
  { header: "Prop firm", kind: "text", width: 16, value: (t) => t.firmName },
  { header: "Symbol", kind: "text", width: 10, value: (t) => t.symbol },
  { header: "Direction", kind: "text", width: 9, value: (t) => t.direction },
  { header: "Quantity", kind: "number", width: 10, value: (t) => t.quantity },
  { header: "Entry", kind: "price", width: 12, value: (t) => t.entryPrice },
  { header: "Exit", kind: "price", width: 12, value: (t) => t.exitPrice },
  { header: "Stop loss", kind: "price", width: 12, value: (t) => t.stopLoss },
  { header: "Take profit", kind: "price", width: 12, value: (t) => t.takeProfit },
  { header: "Commission", kind: "money", width: 11, value: (t) => t.commission },
  { header: "Swap", kind: "money", width: 10, value: (t) => t.swap },
  { header: "Gross P&L", kind: "money", width: 12, value: (t) => t.grossPnl },
  { header: "Net P&L", kind: "money", width: 12, value: (t) => t.netPnl },
  { header: "Risk", kind: "money", width: 11, value: (t) => t.initialRisk },
  { header: "Risk %", kind: "pct", width: 8, value: (t) => t.riskPercent },
  { header: "R multiple", kind: "ratio", width: 10, value: (t) => t.rMultiple },
  { header: "Planned R:R", kind: "ratio", width: 11, value: (t) => t.plannedRR },
  { header: "Strategy", kind: "text", width: 18, value: (t) => t.strategy },
  { header: "Setup", kind: "text", width: 18, value: (t) => t.setup },
  { header: "Session", kind: "text", width: 16, value: (t) => t.session },
  { header: "Timeframe", kind: "text", width: 10, value: (t) => t.timeframe },
  { header: "Grade", kind: "text", width: 7, value: (t) => (t.grade ? GRADE_LABEL[t.grade] ?? t.grade : null) },
  { header: "Tags", kind: "text", width: 24, value: (t) => t.tags.join("; ") },
  { header: "Emotions (1–5)", kind: "text", width: 28, value: (t) => emotionsText(t.emotions) },
  { header: "Followed plan", kind: "text", width: 12, value: (t) => (t.followedPlan === null ? null : t.followedPlan ? "Yes" : "No") },
  { header: "Notes", kind: "text", width: 40, value: (t) => t.notes },
];

export function tradeRows(trades: TradeExportSource[], tz: string): CsvValue[][] {
  return trades.map((t) => TRADE_COLUMNS.map((c) => c.value(t, tz)));
}
