import "server-only";
import type { TradingRuleParsed } from "@/lib/validation/rule";
import { prisma } from "../db";
import { UserError } from "../action";
import { rebuildAccount, rebuildAllAccounts } from "./rebuild";

/**
 * Personal trading rule writes. Violations are derived data, so every change rebuilds the
 * accounts the rule applies to — all of the user's accounts for a global rule, and both the old
 * and the new account when a rule's scope moves.
 */

async function assertAccount(userId: string, accountId: string | null) {
  if (!accountId) return;
  const n = await prisma.tradingAccount.count({ where: { id: accountId, userId } });
  if (!n) throw new UserError("Account not found");
}

function ruleData(input: TradingRuleParsed) {
  const hours = input.type === "TRADING_HOURS";
  return {
    type: input.type,
    value: hours ? null : input.value,
    startMinute: hours ? input.start : null,
    endMinute: hours ? input.end : null,
    accountId: input.accountId,
    hardLimit: input.hardLimit,
    isActive: input.isActive,
  };
}

async function rebuildScopes(userId: string, scopes: (string | null)[]) {
  if (scopes.some((s) => s === null)) return rebuildAllAccounts(userId);
  for (const id of new Set(scopes as string[])) await rebuildAccount(userId, id);
}

export async function createTradingRuleForUser(userId: string, input: TradingRuleParsed) {
  await assertAccount(userId, input.accountId);
  const r = await prisma.tradingRule.create({ data: { userId, ...ruleData(input) } });
  await rebuildScopes(userId, [r.accountId]);
  return { id: r.id };
}

export async function updateTradingRuleForUser(userId: string, input: TradingRuleParsed & { id: string }) {
  const prev = await prisma.tradingRule.findFirst({ where: { id: input.id, userId } });
  if (!prev) throw new UserError("Rule not found");
  await assertAccount(userId, input.accountId);
  await prisma.tradingRule.update({ where: { id: prev.id }, data: ruleData(input) });
  await rebuildScopes(userId, [prev.accountId, input.accountId]);
  return { id: prev.id };
}

export async function setTradingRuleFlagsForUser(userId: string, input: { id: string; isActive?: boolean; hardLimit?: boolean }) {
  const prev = await prisma.tradingRule.findFirst({ where: { id: input.id, userId } });
  if (!prev) throw new UserError("Rule not found");
  await prisma.tradingRule.update({ where: { id: prev.id }, data: { isActive: input.isActive, hardLimit: input.hardLimit } });
  // Hard-limit changes don't affect stored violations; activation does.
  if (input.isActive !== undefined && input.isActive !== prev.isActive) await rebuildScopes(userId, [prev.accountId]);
  return { id: prev.id };
}

export async function deleteTradingRuleForUser(userId: string, id: string) {
  const prev = await prisma.tradingRule.findFirst({ where: { id, userId } });
  if (!prev) throw new UserError("Rule not found");
  await prisma.tradingRule.delete({ where: { id: prev.id } });
  await rebuildScopes(userId, [prev.accountId]);
  return { id: prev.id };
}
