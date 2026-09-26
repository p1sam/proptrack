"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { AccountEventType, AccountStatus } from "@/generated/prisma/enums";
import { prisma } from "../db";
import { createAction, UserError } from "../action";
import { rebuildAccount } from "../services/rebuild";
import {
  advanceAccountSchema,
  changeStatusSchema,
  createAccountSchema,
  eventSchema,
  feeSchema,
  propFirmSchema,
  ruleSchema,
  updateAccountSchema,
} from "@/lib/validation/account";
import { id } from "@/lib/validation/common";

const STATUS_EVENT: Partial<Record<AccountStatus, AccountEventType>> = {
  PASSED: "CHALLENGE_PASSED",
  FUNDED: "FUNDED_ACTIVATED",
  BREACHED: "ACCOUNT_BREACHED",
  FAILED: "ACCOUNT_FAILED",
  SUSPENDED: "ACCOUNT_SUSPENDED",
  ARCHIVED: "ACCOUNT_CLOSED",
};
const TERMINAL: AccountStatus[] = ["FAILED", "BREACHED", "ARCHIVED"];

async function ownedAccount(userId: string, accountId: string) {
  const a = await prisma.tradingAccount.findFirst({ where: { id: accountId, userId }, include: { rule: true } });
  if (!a) throw new UserError("Account not found");
  return a;
}

async function resolveFirm(userId: string, propFirmId: string | null | undefined, newName: string | null) {
  if (newName) {
    const firm = await prisma.propFirm.upsert({ where: { userId_name: { userId, name: newName } }, update: {}, create: { userId, name: newName } });
    return firm.id;
  }
  if (!propFirmId) return null;
  const firm = await prisma.propFirm.findFirst({ where: { id: propFirmId, userId } });
  if (!firm) throw new UserError("Prop firm not found");
  return firm.id;
}

function revalidateAccounts(accountId?: string) {
  revalidatePath("/", "layout");
  if (accountId) revalidatePath(`/accounts/${accountId}`);
}

// ─── Prop firms ─────────────────────────────────────────────────────────────

export const savePropFirm = createAction(propFirmSchema, async (input, user) => {
  const data = { name: input.name, website: input.website, notes: input.notes, ruleTemplate: input.ruleTemplate ?? undefined };
  if (input.id) {
    const existing = await prisma.propFirm.findFirst({ where: { id: input.id, userId: user.id } });
    if (!existing) throw new UserError("Prop firm not found");
    await prisma.propFirm.update({ where: { id: input.id }, data });
  } else {
    const dup = await prisma.propFirm.findUnique({ where: { userId_name: { userId: user.id, name: input.name } } });
    if (dup) throw new UserError("A prop firm with that name already exists");
    await prisma.propFirm.create({ data: { ...data, userId: user.id } });
  }
  revalidateAccounts();
  return undefined;
});

export const deletePropFirm = createAction(z.object({ id }), async ({ id }, user) => {
  const r = await prisma.propFirm.deleteMany({ where: { id, userId: user.id } });
  if (!r.count) throw new UserError("Prop firm not found");
  revalidateAccounts();
  return undefined;
});

// ─── Accounts ───────────────────────────────────────────────────────────────

export const createAccount = createAction(createAccountSchema, async (input, user) => {
  const propFirmId = await resolveFirm(user.id, input.propFirmId, input.newPropFirmName);
  const startingBalance = input.startingBalance ?? input.accountSize;
  const purchasedAt = input.purchasedAt ?? input.startedAt ?? new Date();
  const account = await prisma.$transaction(async (tx) => {
    const a = await tx.tradingAccount.create({
      data: {
        userId: user.id,
        propFirmId,
        name: input.name,
        accountNumber: input.accountNumber,
        accountSize: input.accountSize,
        startingBalance,
        currency: input.currency,
        accountType: input.accountType,
        phase: input.phase,
        status: input.status,
        purchasedAt: input.purchasedAt,
        startedAt: input.startedAt,
        notes: input.notes,
        rule: input.rule ? { create: input.rule } : undefined,
      },
    });
    if (input.challengeFee && input.challengeFee > 0) {
      await tx.accountFee.create({
        data: { accountId: a.id, type: "CHALLENGE", amount: input.challengeFee, currency: input.feeCurrency ?? input.currency, paidAt: purchasedAt },
      });
    }
    const isEval = input.status === "CHALLENGE";
    await tx.accountEvent.createMany({
      data: [
        ...(isEval || input.challengeFee ? [{ accountId: a.id, type: "CHALLENGE_PURCHASED" as const, occurredAt: purchasedAt, amount: input.challengeFee ?? null }] : []),
        ...(input.startedAt
          ? [{ accountId: a.id, type: (input.status === "FUNDED" ? "FUNDED_ACTIVATED" : "CHALLENGE_STARTED") as AccountEventType, occurredAt: input.startedAt }]
          : []),
      ],
    });
    return a;
  });
  revalidateAccounts(account.id);
  return { id: account.id };
});

export const updateAccount = createAction(updateAccountSchema, async (input, user) => {
  const existing = await ownedAccount(user.id, input.id);
  const propFirmId = await resolveFirm(user.id, input.propFirmId, input.newPropFirmName);
  await prisma.tradingAccount.update({
    where: { id: existing.id },
    data: {
      propFirmId,
      name: input.name,
      accountNumber: input.accountNumber,
      accountSize: input.accountSize,
      startingBalance: input.startingBalance ?? input.accountSize,
      currency: input.currency,
      accountType: input.accountType,
      phase: input.phase,
      purchasedAt: input.purchasedAt,
      startedAt: input.startedAt,
      notes: input.notes,
    },
  });
  await rebuildAccount(user.id, existing.id);
  revalidateAccounts(existing.id);
  return undefined;
});

export const deleteAccount = createAction(z.object({ id, confirmName: z.string() }), async ({ id, confirmName }, user) => {
  const a = await ownedAccount(user.id, id);
  if (confirmName.trim() !== a.name) throw new UserError("Type the account name exactly to confirm deletion");
  await prisma.tradingAccount.delete({ where: { id: a.id } });
  revalidateAccounts();
  return undefined;
});

export const saveAccountRule = createAction(z.object({ accountId: id, rule: ruleSchema }), async ({ accountId, rule }, user) => {
  const a = await ownedAccount(user.id, accountId);
  await prisma.accountRule.upsert({ where: { accountId: a.id }, update: rule, create: { ...rule, accountId: a.id } });
  await rebuildAccount(user.id, a.id);
  revalidateAccounts(a.id);
  return undefined;
});

export const changeAccountStatus = createAction(changeStatusSchema, async (input, user) => {
  const a = await ownedAccount(user.id, input.accountId);
  if (a.status === input.status) return undefined;
  const type: AccountEventType =
    input.status === "PASSED" && a.accountType !== "ONE_STEP" && (a.phase ?? 1) < (a.accountType === "THREE_STEP" ? 3 : 2)
      ? "PHASE_PASSED"
      : STATUS_EVENT[input.status] ?? "STATUS_CHANGED";
  await prisma.$transaction([
    prisma.tradingAccount.update({
      where: { id: a.id },
      data: { status: input.status, endedAt: TERMINAL.includes(input.status) ? a.endedAt ?? input.occurredAt : a.endedAt },
    }),
    prisma.accountEvent.create({
      data: { accountId: a.id, type, occurredAt: input.occurredAt, fromStatus: a.status, toStatus: input.status, notes: input.notes },
    }),
  ]);
  revalidateAccounts(a.id);
  return undefined;
});

/**
 * Lifecycle transitions that create the next account in the chain:
 * - NEXT_PHASE: evaluation phase passed → new phase account (status CHALLENGE, phase + 1)
 * - FUNDED:     challenge passed → new funded account
 * - RESET:      failed/breached attempt → new attempt with a reset fee
 * The previous account is closed out (PASSED or FAILED) and both get timeline events.
 */
export const advanceAccount = createAction(advanceAccountSchema, async (input, user) => {
  const parent = await ownedAccount(user.id, input.accountId);
  const child = await prisma.$transaction(async (tx) => {
    const isFunded = input.kind === "FUNDED";
    const rule = parent.rule;
    const ruleData = rule ? copyRule(rule) : null;
    const c = await tx.tradingAccount.create({
      data: {
        userId: user.id,
        propFirmId: parent.propFirmId,
        parentAccountId: parent.id,
        name: input.name,
        accountNumber: input.accountNumber,
        accountSize: parent.accountSize,
        startingBalance: input.startingBalance,
        currency: parent.currency,
        accountType: isFunded ? "FUNDED" : parent.accountType,
        phase: input.kind === "NEXT_PHASE" ? (parent.phase ?? 1) + 1 : input.kind === "RESET" ? parent.phase : null,
        status: isFunded ? "FUNDED" : "CHALLENGE",
        purchasedAt: input.kind === "RESET" ? input.startedAt : null,
        startedAt: input.startedAt,
        rule:
          ruleData && input.keepRules
            ? { create: { ...ruleData, profitTargetPct: isFunded ? null : ruleData.profitTargetPct, minTradingDays: isFunded ? null : ruleData.minTradingDays } }
            : undefined,
      },
    });
    if (input.fee && input.fee > 0) {
      await tx.accountFee.create({
        data: { accountId: c.id, type: input.kind === "RESET" ? "RESET" : input.kind === "FUNDED" ? "ACTIVATION" : "OTHER", amount: input.fee, currency: parent.currency, paidAt: input.startedAt },
      });
    }
    const parentStatus: AccountStatus = input.kind === "RESET" ? (parent.status === "BREACHED" ? "BREACHED" : "FAILED") : "PASSED";
    await tx.tradingAccount.update({ where: { id: parent.id }, data: { status: parentStatus, endedAt: parent.endedAt ?? input.startedAt } });
    await tx.accountEvent.createMany({
      data: [
        ...(parent.status !== parentStatus
          ? [{
              accountId: parent.id,
              type: (input.kind === "RESET" ? "ACCOUNT_FAILED" : input.kind === "NEXT_PHASE" ? "PHASE_PASSED" : "CHALLENGE_PASSED") as AccountEventType,
              occurredAt: input.startedAt,
              fromStatus: parent.status,
              toStatus: parentStatus,
            }]
          : []),
        {
          accountId: c.id,
          type: (input.kind === "FUNDED" ? "FUNDED_ACTIVATED" : input.kind === "RESET" ? "ACCOUNT_RESET" : "CHALLENGE_STARTED") as AccountEventType,
          occurredAt: input.startedAt,
          amount: input.fee ?? null,
          notes: `Continued from ${parent.name}`,
        },
      ],
    });
    return c;
  });
  revalidateAccounts(child.id);
  return { id: child.id };
});

function copyRule<T extends { id: string; accountId: string; createdAt: Date; updatedAt: Date }>(rule: T) {
  const skip = new Set(["id", "accountId", "createdAt", "updatedAt"]);
  return Object.fromEntries(Object.entries(rule).filter(([k]) => !skip.has(k))) as Omit<T, "id" | "accountId" | "createdAt" | "updatedAt">;
}

// ─── Events & fees ──────────────────────────────────────────────────────────

export const addAccountEvent = createAction(eventSchema, async (input, user) => {
  const a = await ownedAccount(user.id, input.accountId);
  await prisma.accountEvent.create({ data: { accountId: a.id, type: input.type, occurredAt: input.occurredAt, amount: input.amount, notes: input.notes } });
  revalidateAccounts(a.id);
  return undefined;
});

export const deleteAccountEvent = createAction(z.object({ id }), async ({ id }, user) => {
  const r = await prisma.accountEvent.deleteMany({ where: { id, account: { userId: user.id } } });
  if (!r.count) throw new UserError("Event not found");
  revalidateAccounts();
  return undefined;
});

export const addFee = createAction(feeSchema, async (input, user) => {
  const a = await ownedAccount(user.id, input.accountId);
  if (input.refunded && input.refunded > input.amount) throw new UserError("Refund cannot exceed the fee");
  await prisma.accountFee.create({
    data: { accountId: a.id, type: input.type, amount: input.amount, currency: input.currency ?? a.currency, paidAt: input.paidAt, refunded: input.refunded ?? 0, notes: input.notes },
  });
  if (input.type === "RESET") await prisma.accountEvent.create({ data: { accountId: a.id, type: "ACCOUNT_RESET", occurredAt: input.paidAt, amount: input.amount } });
  revalidateAccounts(a.id);
  return undefined;
});

export const deleteFee = createAction(z.object({ id }), async ({ id }, user) => {
  const r = await prisma.accountFee.deleteMany({ where: { id, account: { userId: user.id } } });
  if (!r.count) throw new UserError("Fee not found");
  revalidateAccounts();
  return undefined;
});
