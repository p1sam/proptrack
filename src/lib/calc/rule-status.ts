/**
 * Live status tone for each prop-firm rule of an account, derived from AccountState values.
 * "met" = a goal reached (target, min days, payout eligible); "off" = rule not configured or not
 * restricting; "unchecked" = restricted but the journal cannot verify it (news trading, since no
 * economic calendar is available).
 */

export type RuleTone = "ok" | "warning" | "breach" | "met" | "off" | "unchecked";

export type PropRuleKey = "profitTarget" | "dailyLoss" | "maxLoss" | "minDays" | "consistency" | "payout" | "weekend" | "positionSize" | "news";

export interface RuleStatusInput {
  profitTarget: { reached: boolean } | null;
  dailyLoss: { remaining: number; remainingPct: number | null } | null;
  overallLoss: { remaining: number; remainingPct: number | null } | null;
  minTradingDays: { met: boolean } | null;
  consistency: { passes: boolean } | null;
  payout: { eligible: boolean; threshold: number | null; frequencyDays: number | null };
  hasPayoutRules: boolean;
  weekendHoldingAllowed: boolean | null;
  newsTradingAllowed: boolean | null;
  maxPositionSize: number | null;
  /** Count of stored prop-rule violations by rule key (WEEKEND_HOLDING, MAX_POSITION_SIZE, ...). */
  violations: Partial<Record<string, number>>;
}

/** Remaining-allowance tone: none left → breach, under 25% → warning. */
export function allowanceTone(a: { remaining: number; remainingPct: number | null } | null): RuleTone {
  if (!a) return "off";
  if (a.remaining <= 0) return "breach";
  if (a.remainingPct !== null && a.remainingPct < 25) return "warning";
  return "ok";
}

export function propRuleTones(s: RuleStatusInput): Record<PropRuleKey, RuleTone> {
  const v = (k: string) => s.violations[k] ?? 0;
  return {
    profitTarget: s.profitTarget ? (s.profitTarget.reached ? "met" : "ok") : "off",
    dailyLoss: allowanceTone(s.dailyLoss),
    maxLoss: allowanceTone(s.overallLoss),
    minDays: s.minTradingDays ? (s.minTradingDays.met ? "met" : "ok") : "off",
    consistency: s.consistency ? (s.consistency.passes ? "ok" : "warning") : "off",
    payout: s.hasPayoutRules ? (s.payout.eligible ? "met" : "ok") : "off",
    weekend: s.weekendHoldingAllowed === false ? (v("WEEKEND_HOLDING") > 0 ? "warning" : "ok") : "off",
    positionSize: s.maxPositionSize ? (v("MAX_POSITION_SIZE") > 0 ? "warning" : "ok") : "off",
    news: s.newsTradingAllowed === false ? "unchecked" : "off",
  };
}
