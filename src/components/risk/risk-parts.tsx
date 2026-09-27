import Link from "next/link";
import { AlertTriangle, CheckCircle2, Hourglass } from "lucide-react";
import type { PersonalRuleType } from "@/lib/calc/personal-rules";
import { formatMinute } from "@/lib/calc/time";
import { formatNumber, formatPct } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Pnl, RValue } from "@/components/app/pnl";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { RiskPageData } from "@/server/queries/risk";

const plural = (n: number, word: string, many = `${word}s`) => `${formatNumber(n, 0)} ${n === 1 ? word : many}`;

/** A discipline question with its answer. `tone="warning"` adds a warning icon + text, never colour alone. */
export function QuestionCard({ title, answer, tone, children, className }: { title: string; answer?: React.ReactNode; tone?: "warning" | "ok"; children?: React.ReactNode; className?: string }) {
  return (
    <section className={cn("flex flex-col gap-3 rounded-lg border bg-card p-4", className)}>
      <h3 className="text-sm font-semibold">{title}</h3>
      {answer && (
        <p className={cn("flex items-start gap-1.5 text-sm", tone === "warning" && "text-warning")}>
          {tone === "warning" && <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-label="Warning" />}
          {tone === "ok" && <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />}
          <span>{answer}</span>
        </p>
      )}
      {children}
    </section>
  );
}

/** Placeholder shown when a sample is too small for a meaningful statement. */
export function NeedsMore({ n, what = "trade", className }: { n: number; what?: string; className?: string }) {
  return (
    <p className={cn("inline-flex items-center gap-1.5 text-sm text-muted-foreground", className)}>
      <Hourglass className="size-3.5" aria-hidden />
      Needs {plural(n, `more ${what}`, `more ${what}s`)}
    </p>
  );
}

type Sub = RiskPageData["sequences"]["baseline"];

/** Compact comparison rows: label · sample · win rate · avg R · net P&L. */
export function SubsetTable({ rows, currency, minGroup }: { rows: { key: string; label: string; s: Sub }[]; currency: string; minGroup: number }) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Trades</TableHead>
            <TableHead className="text-right">n</TableHead>
            <TableHead className="text-right">Win rate</TableHead>
            <TableHead className="text-right">Avg R</TableHead>
            <TableHead className="text-right">Net P&amp;L</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(({ key, label, s }) => (
            <TableRow key={key}>
              <TableCell className="font-medium">{label}</TableCell>
              <TableCell className="text-right tabular">{s.n}</TableCell>
              {s.n < minGroup ? (
                <TableCell colSpan={3} className="text-right">
                  <NeedsMore n={minGroup - s.n} className="text-xs" />
                </TableCell>
              ) : (
                <>
                  <TableCell className="text-right tabular">{formatPct(s.winRate)}</TableCell>
                  <TableCell className="text-right">
                    <RValue value={s.averageR} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Pnl value={s.netPnl} currency={currency} />
                  </TableCell>
                </>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function ruleValue(type: PersonalRuleType, value: number | null, start: number | null, end: number | null): string {
  if (type === "TRADING_HOURS") return start !== null && end !== null ? `${formatMinute(start)}–${formatMinute(end)}` : "—";
  if (value === null) return "—";
  switch (type) {
    case "MAX_RISK_PER_TRADE_PCT":
    case "MAX_DAILY_LOSS_PCT":
      return `${formatNumber(value, 2)}%`;
    case "MAX_TRADES_PER_DAY":
      return `${formatNumber(value, 0)} trades/day`;
    case "MAX_LOSING_TRADES_PER_DAY":
      return `${formatNumber(value, 0)} losers/day`;
    case "MAX_CONSECUTIVE_LOSSES_PER_DAY":
      return `${formatNumber(value, 0)} losses in a row`;
    case "MAX_DAILY_LOSS_AMOUNT":
      return `${formatNumber(value, 2)} (account currency)`;
    case "MAX_POSITION_SIZE":
      return `${formatNumber(value, 2)} lots`;
    case "MIN_MINUTES_BETWEEN_TRADES":
      return `${formatNumber(value, 0)} min`;
  }
}

/** Active personal rules with how the filtered trades compare against them. */
export function RuleChecks({ rules }: { rules: RiskPageData["ruleChecks"] }) {
  if (!rules.length)
    return (
      <p className="text-sm text-muted-foreground">
        No active personal rules for these accounts.{" "}
        <Link href="/rules" className="text-foreground underline-offset-2 hover:underline">
          Add rules
        </Link>{" "}
        to compare your trading against them.
      </p>
    );
  return (
    <ul className="flex flex-col divide-y">
      {rules.map((r) => {
        const broken = r.measured ? r.measured.exceeded > 0 : r.violations > 0;
        const detail = r.measured
          ? r.measured.measured === 0
            ? `no ${r.measured.unit} with a measurable value`
            : `${formatNumber(r.measured.exceeded, 0)} of ${plural(r.measured.measured, r.measured.unit.slice(0, -1))} exceeded it${r.measured.pct !== null && r.measured.exceeded ? ` (${formatPct(r.measured.pct)})` : ""}${r.measured.unit === "days" ? ", accounts combined" : ""}`
          : r.violations
            ? `broken ${plural(r.violations, "time")} in this period`
            : "not broken in this period";
        return (
          <li key={r.id} className="flex flex-col gap-0.5 py-2 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <div className="min-w-0 text-sm">
              <span className="font-medium">Rule: {r.label}</span> <span className="tabular">{ruleValue(r.type, r.value, r.startMinute, r.endMinute)}</span>
              <span className="text-xs text-muted-foreground">
                {" "}
                · {r.scope}
                {r.hardLimit ? " · hard limit" : ""}
              </span>
            </div>
            <p className={cn("flex items-center gap-1.5 text-sm tabular", broken ? "text-warning" : "text-muted-foreground")}>
              {broken ? <AlertTriangle className="size-4 shrink-0" aria-label="Warning" /> : <CheckCircle2 className="size-4 shrink-0" aria-hidden />}
              <span>
                {detail}
                {r.measured && <span className="text-xs text-muted-foreground"> · {plural(r.violations, "logged break")}</span>}
              </span>
            </p>
          </li>
        );
      })}
    </ul>
  );
}

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

/** Emotion ratings (1–5) vs average R, with correlation and sample size per emotion. */
export function EmotionTable({ emotions, minTrades }: { emotions: RiskPageData["emotions"]; minTrades: number }) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <caption className="sr-only">Average R by emotion rating level</caption>
        <TableHeader>
          <TableRow>
            <TableHead>Emotion</TableHead>
            {[1, 2, 3, 4, 5].map((l) => (
              <TableHead key={l} className="text-right">
                {l}
              </TableHead>
            ))}
            <TableHead className="text-right">r with R</TableHead>
            <TableHead className="text-right">n</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {emotions.map((e) => (
            <TableRow key={e.emotion}>
              <TableCell className="font-medium">{cap(e.emotion)}</TableCell>
              {e.levels.map((l) => (
                <TableCell key={l.level} className="text-right" title={`${l.n} trade${l.n === 1 ? "" : "s"} rated ${l.level}`}>
                  {l.n ? (
                    <>
                      <RValue value={l.averageR} /> <span className="text-xs text-muted-foreground tabular">({l.n})</span>
                    </>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
              ))}
              <TableCell className="text-right tabular">
                {e.n >= minTrades ? formatNumber(e.correlationWithR, 2) : <span className="text-xs text-muted-foreground">needs {minTrades - e.n} more</span>}
              </TableCell>
              <TableCell className="text-right tabular">{e.n}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

