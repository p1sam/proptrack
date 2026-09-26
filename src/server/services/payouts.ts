import "server-only";
import { payoutEventSpecs, payoutIssues, shouldMarkAccountReceived, type PayoutEventType, type PayoutStatusKey } from "@/lib/calc/payouts";
import type { PayoutParsed } from "@/lib/validation/payout";
import { num, numOrNull } from "@/lib/num";
import type { AccountStatus } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "../db";
import { UserError } from "../action";
import { rebuildAccount } from "./rebuild";

/**
 * Payout writes. Every change keeps the account timeline (AccountEvent rows linked by payoutId)
 * in sync with the payout's state, optionally moves a funded account to PAYOUT_RECEIVED when a
 * payout is first marked paid, and rebuilds the affected account(s) — a withdrawal changes the
 * balance, and with it drawdown floors, risk % and rule checks.
 */

type Tx = Prisma.TransactionClient;
type PayoutRow = Prisma.PayoutGetPayload<object>;
const PAYOUT_EVENT_TYPES: PayoutEventType[] = ["PAYOUT_REQUESTED", "PAYOUT_APPROVED", "PAYOUT_RECEIVED", "PAYOUT_REJECTED"];
const DAY = 86_400_000;

async function ownedAccount(userId: string, accountId: string) {
  const a = await prisma.tradingAccount.findFirst({ where: { id: accountId, userId }, include: { rule: true } });
  if (!a) throw new UserError("Account not found");
  return a;
}

async function ownedPayout(userId: string, id: string) {
  const p = await prisma.payout.findFirst({ where: { id, userId } });
  if (!p) throw new UserError("Payout not found");
  return p;
}

function assertValid(p: Parameters<typeof payoutIssues>[0]) {
  const errors = payoutIssues(p).filter((i) => i.level === "error");
  if (errors.length) throw new UserError(errors.map((e) => e.message).join(" "));
}

/**
 * Events belonging to a payout: rows linked by payoutId, plus legacy unlinked rows on the same
 * account that match by type, amount and date (e.g. imported or seeded history), so an edit
 * replaces them instead of duplicating the timeline.
 */
async function eventsOf(tx: Tx, p: PayoutRow) {
  const linked = await tx.accountEvent.findMany({ where: { payoutId: p.id } });
  if (linked.length) return linked;
  // Legacy rows already linked to another payout are never candidates (payoutId: null).
  const candidates = await tx.accountEvent.findMany({ where: { accountId: p.accountId, payoutId: null, type: { in: PAYOUT_EVENT_TYPES } } });
  const near = (a: Date, b: Date | null) => b !== null && Math.abs(a.getTime() - b.getTime()) <= DAY;
  const same = (a: unknown, b: number | null) => a !== null && b !== null && num(a as number) === b;
  const req = num(p.amountRequested);
  const rec = numOrNull(p.amountReceived);
  return candidates.filter((e) => {
    switch (e.type) {
      case "PAYOUT_REQUESTED":
        return same(e.amount, req) && near(e.occurredAt, p.requestedAt ?? p.approvedAt ?? p.paidAt);
      case "PAYOUT_APPROVED":
        return same(e.amount, req) && near(e.occurredAt, p.approvedAt);
      case "PAYOUT_RECEIVED":
        return same(e.amount, rec) && near(e.occurredAt, p.paidAt);
      case "PAYOUT_REJECTED":
        return same(e.amount, req) && p.status === "REJECTED";
      default:
        return false;
    }
  });
}

/** Link matching legacy events to the payout so later syncs treat them as its own. */
async function adoptLegacyEvents(tx: Tx, p: PayoutRow) {
  const events = await eventsOf(tx, p);
  const unlinked = events.filter((e) => e.payoutId === null);
  if (unlinked.length) await tx.accountEvent.updateMany({ where: { id: { in: unlinked.map((e) => e.id) } }, data: { payoutId: p.id } });
}

/** Replace the payout's linked events with the ones its current state implies. */
async function syncPayoutEvents(tx: Tx, p: PayoutRow, opts: { now: Date; rejectedAt?: Date; statusChange?: { from: AccountStatus; to: AccountStatus } }) {
  const existing = await tx.accountEvent.findMany({ where: { payoutId: p.id } });
  const dates: Partial<Record<PayoutEventType, Date>> = {};
  for (const e of existing) if ((PAYOUT_EVENT_TYPES as string[]).includes(e.type)) dates[e.type as PayoutEventType] = e.occurredAt;
  if (opts.rejectedAt) dates.PAYOUT_REJECTED = opts.rejectedAt;
  const prevReceived = existing.find((e) => e.type === "PAYOUT_RECEIVED" && e.toStatus);
  const specs = payoutEventSpecs(
    { status: p.status, requestedAt: p.requestedAt, approvedAt: p.approvedAt, paidAt: p.paidAt, amountRequested: num(p.amountRequested), amountReceived: numOrNull(p.amountReceived) },
    { now: opts.now, existing: dates },
  );
  if (existing.length) await tx.accountEvent.deleteMany({ where: { id: { in: existing.map((e) => e.id) } } });
  if (!specs.length) return;
  await tx.accountEvent.createMany({
    data: specs.map((s) => {
      const change = s.type === "PAYOUT_RECEIVED" ? opts.statusChange ?? (prevReceived ? { from: prevReceived.fromStatus, to: prevReceived.toStatus } : null) : null;
      return {
        accountId: p.accountId,
        payoutId: p.id,
        type: s.type,
        occurredAt: s.occurredAt,
        amount: s.amount,
        fromStatus: change?.from ?? null,
        toStatus: change?.to ?? null,
        notes: s.type === "PAYOUT_REJECTED" && p.status === "REJECTED" ? p.notes : null,
      };
    }),
  });
}

/** Move a FUNDED / PAYOUT_ELIGIBLE account to PAYOUT_RECEIVED when a payout first becomes PAID. */
async function maybeMarkAccount(tx: Tx, account: { id: string; status: AccountStatus }, prev: PayoutStatusKey | null, next: PayoutStatusKey, enabled: boolean) {
  if (!enabled || !shouldMarkAccountReceived(prev, next, account.status)) return undefined;
  await tx.tradingAccount.update({ where: { id: account.id }, data: { status: "PAYOUT_RECEIVED" } });
  return { from: account.status, to: "PAYOUT_RECEIVED" as AccountStatus };
}

function payoutData(input: PayoutParsed, account: Awaited<ReturnType<typeof ownedAccount>>) {
  return {
    accountId: account.id,
    status: input.status,
    requestedAt: input.requestedAt,
    approvedAt: input.approvedAt,
    paidAt: input.paidAt,
    amountRequested: input.amountRequested,
    amountReceived: input.amountReceived,
    profitSplitPct: input.profitSplitPct ?? numOrNull(account.rule?.profitSplitPct),
    fees: input.fees,
    paymentMethod: input.paymentMethod,
    currency: input.currency ?? account.currency,
    deductFromBalance: input.deductFromBalance,
    notes: input.notes,
  };
}

export async function createPayoutForUser(userId: string, input: PayoutParsed, now = new Date()) {
  const account = await ownedAccount(userId, input.accountId);
  assertValid(input);
  const result = await prisma.$transaction(async (tx) => {
    const p = await tx.payout.create({ data: { userId, ...payoutData(input, account) } });
    const statusChange = await maybeMarkAccount(tx, account, null, p.status, input.markAccountReceived);
    await syncPayoutEvents(tx, p, { now, statusChange });
    return { id: p.id, accountStatusChanged: !!statusChange };
  });
  await rebuildAccount(userId, account.id);
  return result;
}

export async function updatePayoutForUser(userId: string, input: PayoutParsed & { id: string }, now = new Date()) {
  const prev = await ownedPayout(userId, input.id);
  const account = await ownedAccount(userId, input.accountId);
  assertValid(input);
  const result = await prisma.$transaction(async (tx) => {
    // Resolve legacy events against the *old* row before it changes.
    await adoptLegacyEvents(tx, prev);
    const p = await tx.payout.update({ where: { id: prev.id }, data: payoutData(input, account) });
    const statusChange = await maybeMarkAccount(tx, account, prev.status, p.status, input.markAccountReceived);
    await syncPayoutEvents(tx, p, { now, statusChange });
    return { id: p.id, accountStatusChanged: !!statusChange };
  });
  await rebuildAccount(userId, account.id);
  if (prev.accountId !== account.id) await rebuildAccount(userId, prev.accountId);
  return result;
}

export async function deletePayoutForUser(userId: string, id: string) {
  const p = await ownedPayout(userId, id);
  await prisma.$transaction(async (tx) => {
    const events = await eventsOf(tx, p);
    if (events.length) await tx.accountEvent.deleteMany({ where: { id: { in: events.map((e) => e.id) } } });
    await tx.payout.delete({ where: { id: p.id } });
  });
  await rebuildAccount(userId, p.accountId);
  return { accountId: p.accountId };
}

export async function transitionPayoutForUser(
  userId: string,
  input: { id: string; to: "REQUESTED" | "APPROVED" | "PAID" | "REJECTED"; at: Date; amountReceived: number | null; markAccountReceived: boolean },
  now = new Date(),
) {
  const prev = await ownedPayout(userId, input.id);
  if (prev.status === input.to) throw new UserError("The payout already has that status");
  if (prev.status === "PAID" && input.to !== "PAID") throw new UserError("Edit the payout to change a paid payout");
  const account = await ownedAccount(userId, prev.accountId);
  const next = {
    status: input.to,
    requestedAt: input.to === "REQUESTED" ? input.at : prev.requestedAt ?? (input.to !== "REJECTED" ? input.at : null),
    approvedAt: input.to === "APPROVED" ? input.at : prev.approvedAt,
    paidAt: input.to === "PAID" ? input.at : prev.paidAt,
    amountReceived: input.to === "PAID" ? input.amountReceived : numOrNull(prev.amountReceived),
  };
  if (input.to === "REJECTED" && !next.requestedAt) next.requestedAt = input.at;
  assertValid({ ...next, amountRequested: num(prev.amountRequested) });
  const result = await prisma.$transaction(async (tx) => {
    await adoptLegacyEvents(tx, prev);
    const p = await tx.payout.update({ where: { id: prev.id }, data: next });
    const statusChange = await maybeMarkAccount(tx, account, prev.status, p.status, input.markAccountReceived);
    await syncPayoutEvents(tx, p, { now, statusChange, rejectedAt: input.to === "REJECTED" ? input.at : undefined });
    return { id: p.id, accountStatusChanged: !!statusChange };
  });
  await rebuildAccount(userId, account.id);
  return result;
}
