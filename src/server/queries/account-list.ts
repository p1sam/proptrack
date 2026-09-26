import "server-only";
import { sumConverted } from "@/lib/calc/fx";
import { subMoney } from "@/lib/calc/money";
import { prisma } from "../db";
import { buildPortfolio, getFxTable, getPrefs, listAccountSummaries, type AccountSummary } from "./accounts";
import { ruleDTO } from "./account-detail";

/** Read models for /accounts and /challenges. Every query is scoped by userId. */

export type AccountFilterTab = "all" | "challenge" | "funded" | "passed" | "failed" | "archived";

export function matchesTab(a: AccountSummary, tab: AccountFilterTab) {
  switch (tab) {
    case "all":
      return true;
    case "challenge":
      return a.group === "challenge";
    case "funded":
      return a.group === "funded";
    case "passed":
      return a.group === "passed";
    case "failed":
      return a.group === "failed";
    case "archived":
      return a.group === "inactive";
  }
}

export function matchesSearch(a: AccountSummary, q: string | undefined) {
  if (!q) return true;
  const needle = q.toLowerCase();
  return [a.name, a.accountNumber, a.firm?.name, a.currency].some((s) => s?.toLowerCase().includes(needle));
}

export async function getPropFirms(userId: string) {
  const firms = await prisma.propFirm.findMany({
    where: { userId },
    orderBy: { name: "asc" },
    include: { _count: { select: { accounts: true } } },
  });
  return firms.map((f) => ({
    id: f.id,
    name: f.name,
    website: f.website,
    notes: f.notes,
    accountCount: f._count.accounts,
    // ruleTemplate is JSON of AccountRule fields (validated with ruleSchema.partial() on save).
    ruleTemplate: (f.ruleTemplate ?? null) as Partial<NonNullable<ReturnType<typeof ruleDTO>>> | null,
  }));
}
export type PropFirmDTO = Awaited<ReturnType<typeof getPropFirms>>[number];

export async function getAccountsPage(userId: string) {
  const [prefs, accounts, fx, firms] = await Promise.all([getPrefs(userId), listAccountSummaries(userId), getFxTable(userId), getPropFirms(userId)]);
  const portfolio = buildPortfolio(accounts, prefs.currency, fx);
  return { prefs, accounts, portfolio, firms };
}

const EVAL_TYPES = new Set(["ONE_STEP", "TWO_STEP", "THREE_STEP", "OTHER"]);

export async function getChallengesPage(userId: string) {
  const [prefs, accounts, fx] = await Promise.all([getPrefs(userId), listAccountSummaries(userId), getFxTable(userId)]);
  const portfolio = buildPortfolio(accounts, prefs.currency, fx);
  const evaluations = accounts.filter((a) => EVAL_TYPES.has(a.accountType));
  const active = accounts.filter((a) => a.status === "CHALLENGE");
  const resolved = evaluations
    .filter((a) => a.status !== "CHALLENGE" && (a.group === "passed" || a.group === "failed" || a.group === "funded"))
    .sort((a, b) => (b.endedAt ?? b.startedAt ?? "").localeCompare(a.endedAt ?? a.startedAt ?? ""));
  // Fees spent on evaluation accounts (challenge, reset, ...), net of refunds, in the user's currency.
  const fees = sumConverted(
    evaluations.flatMap((a) => a.economics.feeItems.map((f) => ({ amount: subMoney(f.amount, f.refunded), currency: f.currency }))),
    prefs.currency,
    fx,
  );
  return { prefs, portfolio, active, resolved, challengeFees: fees.total, feesMissingCurrencies: fees.missing };
}
