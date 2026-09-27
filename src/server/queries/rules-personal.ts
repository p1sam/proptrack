import "server-only";
import { z } from "zod";
import { RULE_LABELS, type PersonalRuleType } from "@/lib/calc/personal-rules";
import { addDaysToKey, dayKey } from "@/lib/calc/time";
import { RANGE_PRESETS, resolveDateBounds } from "@/lib/filters";
import { num, numOrNull } from "@/lib/num";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "../db";
import { getPrefs } from "./accounts";

/** The user's personal trading rules with how often each was broken. */
export async function listTradingRules(userId: string) {
  const prefs = await getPrefs(userId);
  const since = addDaysToKey(dayKey(new Date(), prefs.timezone), -29);
  const [rules, total, recent] = await Promise.all([
    prisma.tradingRule.findMany({ where: { userId }, include: { account: { select: { id: true, name: true } } }, orderBy: [{ isActive: "desc" }, { createdAt: "asc" }] }),
    prisma.ruleViolation.groupBy({ by: ["tradingRuleId"], where: { userId, source: "PERSONAL_RULE" }, _count: { _all: true } }),
    prisma.ruleViolation.groupBy({ by: ["tradingRuleId"], where: { userId, source: "PERSONAL_RULE", day: { gte: since } }, _count: { _all: true } }),
  ]);
  const t = new Map(total.map((v) => [v.tradingRuleId, v._count._all]));
  const r = new Map(recent.map((v) => [v.tradingRuleId, v._count._all]));
  return rules.map((x) => ({
    id: x.id,
    type: x.type as PersonalRuleType,
    label: RULE_LABELS[x.type as PersonalRuleType],
    value: numOrNull(x.value),
    startMinute: x.startMinute,
    endMinute: x.endMinute,
    accountId: x.accountId,
    accountName: x.account?.name ?? null,
    hardLimit: x.hardLimit,
    isActive: x.isActive,
    violationsTotal: t.get(x.id) ?? 0,
    violations30d: r.get(x.id) ?? 0,
  }));
}
export type TradingRuleDTO = Awaited<ReturnType<typeof listTradingRules>>[number];

const list = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform((v) => (v === undefined ? [] : (Array.isArray(v) ? v : v.split(",")).map((s) => s.trim()).filter(Boolean)));
export const violationFilterSchema = z.object({
  vsource: z.enum(["PROP_RULE", "PERSONAL_RULE"]).optional().catch(undefined),
  vseverity: z.enum(["WARNING", "BREACH"]).optional().catch(undefined),
  vaccounts: list,
  vrules: list,
  range: z.enum(RANGE_PRESETS).optional().catch(undefined),
});
export type ViolationFilters = z.infer<typeof violationFilterSchema>;
export function parseViolationFilters(sp: Record<string, string | string[] | undefined>): ViolationFilters {
  const r = violationFilterSchema.safeParse(sp);
  return r.success ? r.data : violationFilterSchema.parse({});
}

const PROP_RULE_LABELS: Record<string, string> = {
  MAX_DAILY_LOSS: "Daily loss limit",
  MAX_OVERALL_LOSS: "Max loss / drawdown",
  MAX_POSITION_SIZE: "Max position size",
  WEEKEND_HOLDING: "Weekend holding",
  MAX_TRADING_DAYS: "Max trading days",
};
export function violationRuleLabel(key: string): string {
  return PROP_RULE_LABELS[key] ?? RULE_LABELS[key as PersonalRuleType] ?? key;
}

/** Recent rule violations (prop-firm and personal), newest first. */
export async function listViolations(userId: string, f: ViolationFilters, limit = 200) {
  const prefs = await getPrefs(userId);
  const bounds = resolveDateBounds({ range: f.range ?? "90d", from: undefined, to: undefined }, dayKey(new Date(), prefs.timezone));
  const where: Prisma.RuleViolationWhereInput = {
    userId,
    ...(f.vsource ? { source: f.vsource } : {}),
    ...(f.vseverity ? { severity: f.vseverity } : {}),
    ...(f.vaccounts.length ? { accountId: { in: f.vaccounts } } : {}),
    ...(f.vrules.length ? { ruleKey: { in: f.vrules } } : {}),
    ...(bounds.from || bounds.to ? { day: { ...(bounds.from ? { gte: bounds.from } : {}), ...(bounds.to ? { lte: bounds.to } : {}) } } : {}),
  };
  const [rows, count, keys] = await Promise.all([
    prisma.ruleViolation.findMany({
      where,
      orderBy: { occurredAt: "desc" },
      take: limit,
      select: {
        id: true,
        source: true,
        severity: true,
        ruleKey: true,
        day: true,
        occurredAt: true,
        message: true,
        actual: true,
        limit: true,
        tradeId: true,
        trade: { select: { symbol: true } },
        account: { select: { id: true, name: true } },
        tradingRule: { select: { hardLimit: true } },
      },
    }),
    prisma.ruleViolation.count({ where }),
    prisma.ruleViolation.findMany({ where: { userId }, distinct: ["ruleKey"], select: { ruleKey: true } }),
  ]);
  return {
    range: f.range ?? "90d",
    total: count,
    rows: rows.map((v) => ({
      id: v.id,
      source: v.source,
      severity: v.severity,
      ruleKey: v.ruleKey,
      ruleLabel: violationRuleLabel(v.ruleKey),
      day: v.day,
      occurredAt: v.occurredAt.toISOString(),
      message: v.message,
      actual: v.actual === null ? null : num(v.actual),
      limit: v.limit === null ? null : num(v.limit),
      tradeId: v.tradeId,
      symbol: v.trade?.symbol ?? null,
      accountId: v.account.id,
      accountName: v.account.name,
      hardLimit: v.tradingRule?.hardLimit ?? false,
    })),
    ruleKeys: keys.map((k) => ({ value: k.ruleKey, label: violationRuleLabel(k.ruleKey) })).sort((a, b) => a.label.localeCompare(b.label)),
  };
}
