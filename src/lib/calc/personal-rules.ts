import { D, pctAmount, roundMoney, subMoney } from "./money";
import { classifyOutcome } from "./stats";
import { inMinuteWindow, minuteOfDay } from "./time";

/**
 * The trader's own risk rules ("risk 1% per trade", "max 2 losing trades a day", ...).
 * They are evaluated per account over trading days in the user's timezone. Results are
 * warnings; only rules the user marked as hard limits may block new manual trades
 * (see wouldBreakHardLimit).
 */

export type PersonalRuleType =
  | "MAX_RISK_PER_TRADE_PCT"
  | "MAX_TRADES_PER_DAY"
  | "MAX_LOSING_TRADES_PER_DAY"
  | "MAX_CONSECUTIVE_LOSSES_PER_DAY"
  | "MAX_DAILY_LOSS_PCT"
  | "MAX_DAILY_LOSS_AMOUNT"
  | "MAX_POSITION_SIZE"
  | "TRADING_HOURS"
  | "MIN_MINUTES_BETWEEN_TRADES";

export interface PersonalRule {
  id: string;
  type: PersonalRuleType;
  value?: number | null;
  startMinute?: number | null;
  endMinute?: number | null;
  hardLimit?: boolean;
  isActive?: boolean;
}

export interface RuleTrade {
  id: string;
  openedAt: Date;
  closedAt: Date | null;
  /** Trading day (user timezone) of the open. */
  day: string;
  netPnl: number | null;
  riskPercent: number | null;
  quantity: number;
}

export interface PersonalViolation {
  ruleId: string;
  ruleType: PersonalRuleType;
  tradeId: string | null;
  day: string;
  occurredAt: Date;
  message: string;
  actual: number | null;
  limit: number | null;
}

export const RULE_LABELS: Record<PersonalRuleType, string> = {
  MAX_RISK_PER_TRADE_PCT: "Max risk per trade (%)",
  MAX_TRADES_PER_DAY: "Max trades per day",
  MAX_LOSING_TRADES_PER_DAY: "Max losing trades per day",
  MAX_CONSECUTIVE_LOSSES_PER_DAY: "Stop after consecutive losses",
  MAX_DAILY_LOSS_PCT: "Max daily loss (%)",
  MAX_DAILY_LOSS_AMOUNT: "Max daily loss (amount)",
  MAX_POSITION_SIZE: "Max position size",
  TRADING_HOURS: "Trading hours",
  MIN_MINUTES_BETWEEN_TRADES: "Min minutes between trades",
};

/**
 * @param dayStartBalance balance at the start of each trading day (for % daily loss).
 */
export function evaluatePersonalRules(
  trades: RuleTrade[],
  rules: PersonalRule[],
  opts: { timezone: string; dayStartBalance?: (day: string) => number | null; tolerance?: number },
): PersonalViolation[] {
  const active = rules.filter((r) => r.isActive !== false);
  if (!active.length) return [];
  const out: PersonalViolation[] = [];
  const tol = opts.tolerance ?? 0;
  const days = new Map<string, RuleTrade[]>();
  for (const t of trades) {
    const arr = days.get(t.day) ?? [];
    arr.push(t);
    days.set(t.day, arr);
  }

  for (const rule of active) {
    const v = rule.value ?? null;
    const push = (t: RuleTrade | null, day: string, message: string, actual: number | null, limit: number | null) =>
      out.push({ ruleId: rule.id, ruleType: rule.type, tradeId: t?.id ?? null, day, occurredAt: t ? t.closedAt ?? t.openedAt : new Date(`${day}T12:00:00Z`), message, actual, limit });

    for (const [day, list] of days) {
      const ordered = [...list].sort((a, b) => a.openedAt.getTime() - b.openedAt.getTime() || a.id.localeCompare(b.id));
      switch (rule.type) {
        case "MAX_RISK_PER_TRADE_PCT":
          if (v === null) break;
          for (const t of ordered) if (t.riskPercent !== null && t.riskPercent > v + 1e-9) push(t, day, `Risked ${t.riskPercent.toFixed(2)}% (rule: ${v}%).`, t.riskPercent, v);
          break;
        case "MAX_POSITION_SIZE":
          if (v === null) break;
          for (const t of ordered) if (t.quantity > v) push(t, day, `Position size ${t.quantity} exceeded ${v}.`, t.quantity, v);
          break;
        case "MAX_TRADES_PER_DAY":
          if (v === null) break;
          if (ordered.length > v) push(ordered[v], day, `Took ${ordered.length} trades (rule: ${v}).`, ordered.length, v);
          break;
        case "MAX_LOSING_TRADES_PER_DAY": {
          if (v === null) break;
          const losers = ordered.filter((t) => t.netPnl !== null && classifyOutcome(t.netPnl, tol) === "LOSS");
          if (losers.length > v) push(losers[v], day, `${losers.length} losing trades (rule: ${v}).`, losers.length, v);
          break;
        }
        case "MAX_CONSECUTIVE_LOSSES_PER_DAY": {
          if (v === null) break;
          let streak = 0;
          for (let i = 0; i < ordered.length; i++) {
            const t = ordered[i];
            if (streak >= v) {
              push(t, day, `Kept trading after ${streak} consecutive losses (rule: stop after ${v}).`, streak, v);
              break;
            }
            streak = t.netPnl !== null && classifyOutcome(t.netPnl, tol) === "LOSS" ? streak + 1 : 0;
          }
          break;
        }
        case "MAX_DAILY_LOSS_PCT":
        case "MAX_DAILY_LOSS_AMOUNT": {
          if (v === null) break;
          const start = opts.dayStartBalance?.(day) ?? null;
          const limit = rule.type === "MAX_DAILY_LOSS_AMOUNT" ? v : start !== null ? pctAmount(start, v) : null;
          if (limit === null) break;
          let running = D(0);
          for (const t of [...ordered].filter((x) => x.closedAt).sort((a, b) => a.closedAt!.getTime() - b.closedAt!.getTime())) {
            running = running.plus(D(t.netPnl ?? 0));
            if (running.negated().gt(limit)) {
              push(t, day, `Daily loss ${roundMoney(running.negated()).toFixed(2)} exceeded ${limit.toFixed(2)}.`, roundMoney(running.negated()), limit);
              break;
            }
          }
          break;
        }
        case "TRADING_HOURS": {
          if (rule.startMinute == null || rule.endMinute == null) break;
          for (const t of ordered) {
            const m = minuteOfDay(t.openedAt, opts.timezone);
            if (!inMinuteWindow(m, rule.startMinute, rule.endMinute)) push(t, day, "Trade opened outside your trading hours.", m, null);
          }
          break;
        }
        case "MIN_MINUTES_BETWEEN_TRADES": {
          if (v === null) break;
          for (let i = 1; i < ordered.length; i++) {
            const prev = ordered[i - 1];
            if (!prev.closedAt) continue;
            const gap = (ordered[i].openedAt.getTime() - prev.closedAt.getTime()) / 60_000;
            if (gap >= 0 && gap < v) push(ordered[i], day, `Re-entered ${gap.toFixed(0)} min after the previous trade (rule: ${v} min).`, roundMoney(gap, 1), v);
          }
          break;
        }
      }
    }
  }
  return out.sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
}

/**
 * Hard-limit check for a prospective manual trade: evaluate hard rules with and without the
 * candidate and report any violation attributable to it.
 */
export function wouldBreakHardLimit(
  existing: RuleTrade[],
  candidate: RuleTrade,
  rules: PersonalRule[],
  opts: { timezone: string; dayStartBalance?: (day: string) => number | null; tolerance?: number },
): PersonalViolation[] {
  const hard = rules.filter((r) => r.hardLimit && r.isActive !== false);
  if (!hard.length) return [];
  const sameDay = existing.filter((t) => t.day === candidate.day);
  const tol = opts.tolerance ?? 0;
  const out: PersonalViolation[] = [];

  // Loss-based limits block the *next* trade once reached; the losing trade itself is history.
  const priorClosed = sameDay.filter((t) => t.closedAt && t.closedAt.getTime() <= candidate.openedAt.getTime());
  for (const rule of hard) {
    if (rule.value == null) continue;
    if (rule.type === "MAX_LOSING_TRADES_PER_DAY") {
      const losers = priorClosed.filter((t) => t.netPnl !== null && classifyOutcome(t.netPnl, tol) === "LOSS").length;
      if (losers >= rule.value)
        out.push({ ruleId: rule.id, ruleType: rule.type, tradeId: candidate.id, day: candidate.day, occurredAt: candidate.openedAt, message: `Hard limit: already ${losers} losing trades today (max ${rule.value}).`, actual: losers, limit: rule.value });
    }
    if (rule.type === "MAX_DAILY_LOSS_PCT" || rule.type === "MAX_DAILY_LOSS_AMOUNT") {
      const start = opts.dayStartBalance?.(candidate.day) ?? null;
      const limit = rule.type === "MAX_DAILY_LOSS_AMOUNT" ? rule.value : start !== null ? pctAmount(start, rule.value) : null;
      const loss = -roundMoney(priorClosed.reduce((acc, t) => acc.plus(D(t.netPnl ?? 0)), D(0)));
      if (limit !== null && loss >= limit)
        out.push({ ruleId: rule.id, ruleType: rule.type, tradeId: candidate.id, day: candidate.day, occurredAt: candidate.openedAt, message: `Hard limit: daily loss ${loss.toFixed(2)} already reached the ${limit.toFixed(2)} limit.`, actual: loss, limit });
    }
  }
  const diffRules = hard.filter((r) => r.type !== "MAX_LOSING_TRADES_PER_DAY" && r.type !== "MAX_DAILY_LOSS_PCT" && r.type !== "MAX_DAILY_LOSS_AMOUNT");
  const before = new Set(evaluatePersonalRules(sameDay, diffRules, opts).map((v) => `${v.ruleId}:${v.tradeId}`));
  out.push(
    ...evaluatePersonalRules([...sameDay, candidate], diffRules, opts).filter(
      (v) => v.tradeId === candidate.id && !before.has(`${v.ruleId}:${v.tradeId}`),
    ),
  );
  return out;
}

export function dailyLossHeadroom(dayPnl: number, limit: number): number {
  return subMoney(limit, Math.max(0, -dayPnl));
}
