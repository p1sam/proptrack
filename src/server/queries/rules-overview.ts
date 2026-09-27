import "server-only";
import { propRuleTones, type PropRuleKey, type RuleTone } from "@/lib/calc/rule-status";
import { ACTIVE_STATUSES } from "@/lib/labels";
import { numOrNull } from "@/lib/num";
import type { AccountStatus, DrawdownType } from "@/generated/prisma/enums";
import { prisma } from "../db";
import { listAccountSummaries } from "./accounts";

/**
 * Read-only overview of every active account's prop-firm rules with live status. Editing happens
 * on the account's Rules tab; this view only links there.
 */
export async function getPropRulesOverview(userId: string) {
  const accounts = (await listAccountSummaries(userId)).filter((a) => ACTIVE_STATUSES.includes(a.status));
  const ids = accounts.map((a) => a.id);
  const [rules, violations] = await Promise.all([
    prisma.accountRule.findMany({ where: { accountId: { in: ids }, account: { userId } } }),
    prisma.ruleViolation.groupBy({ by: ["accountId", "ruleKey"], where: { userId, accountId: { in: ids }, source: "PROP_RULE" }, _count: { _all: true } }),
  ]);
  const ruleBy = new Map(rules.map((r) => [r.accountId, r]));
  const vBy = new Map<string, Record<string, number>>();
  for (const v of violations) {
    const m = vBy.get(v.accountId) ?? {};
    m[v.ruleKey] = v._count._all;
    vBy.set(v.accountId, m);
  }

  return accounts.map((a) => {
    const r = ruleBy.get(a.id) ?? null;
    const cfg = r
      ? {
          profitTargetPct: numOrNull(r.profitTargetPct),
          maxDailyLossPct: numOrNull(r.maxDailyLossPct),
          dailyLossBasis: r.dailyLossBasis,
          maxOverallLossPct: numOrNull(r.maxOverallLossPct),
          drawdownType: r.drawdownType as DrawdownType,
          minTradingDays: r.minTradingDays,
          maxTradingDays: r.maxTradingDays,
          maxPositionSize: numOrNull(r.maxPositionSize),
          consistencyPct: numOrNull(r.consistencyPct),
          payoutThresholdAmount: numOrNull(r.payoutThresholdAmount),
          payoutFrequencyDays: r.payoutFrequencyDays,
          profitSplitPct: numOrNull(r.profitSplitPct),
          weekendHoldingAllowed: r.weekendHoldingAllowed,
          newsTradingAllowed: r.newsTradingAllowed,
        }
      : null;
    const violationsByKey = vBy.get(a.id) ?? {};
    const tones: Record<PropRuleKey, RuleTone> = propRuleTones({
      profitTarget: a.profitTarget,
      dailyLoss: a.dailyLoss,
      overallLoss: a.overallLoss,
      minTradingDays: a.minTradingDays,
      consistency: a.consistency,
      payout: a.payout,
      hasPayoutRules: !!cfg && (cfg.payoutThresholdAmount !== null || cfg.payoutFrequencyDays !== null || cfg.profitSplitPct !== null),
      weekendHoldingAllowed: cfg?.weekendHoldingAllowed ?? null,
      newsTradingAllowed: cfg?.newsTradingAllowed ?? null,
      maxPositionSize: cfg?.maxPositionSize ?? null,
      violations: violationsByKey,
    });
    return {
      id: a.id,
      name: a.name,
      firmName: a.firm?.name ?? null,
      status: a.status as AccountStatus,
      currency: a.currency,
      balance: a.balance,
      breached: a.breached,
      rule: cfg,
      tones,
      live: {
        profitTarget: a.profitTarget,
        dailyLoss: a.dailyLoss,
        overallLoss: a.overallLoss,
        minTradingDays: a.minTradingDays,
        tradingDays: a.tradingDays,
        consistency: a.consistency,
        payout: a.payout,
      },
      violations: violationsByKey,
    };
  });
}
export type PropRuleOverviewRow = Awaited<ReturnType<typeof getPropRulesOverview>>[number];
