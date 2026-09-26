import type { AccountEventType, AccountStatus, AccountType, FeeType, PayoutStatus } from "@/generated/prisma/enums";

export const ACCOUNT_STATUSES: AccountStatus[] = ["CHALLENGE", "PASSED", "FUNDED", "PAYOUT_ELIGIBLE", "PAYOUT_RECEIVED", "FAILED", "BREACHED", "SUSPENDED", "ARCHIVED"];

export const STATUS_LABEL: Record<AccountStatus, string> = {
  CHALLENGE: "Challenge",
  PASSED: "Passed",
  FUNDED: "Funded",
  PAYOUT_ELIGIBLE: "Payout eligible",
  PAYOUT_RECEIVED: "Payout received",
  FAILED: "Failed",
  BREACHED: "Breached",
  SUSPENDED: "Suspended",
  ARCHIVED: "Archived",
};

/** Status groupings used throughout the portfolio views. */
export const STATUS_GROUP: Record<AccountStatus, "challenge" | "funded" | "passed" | "failed" | "inactive"> = {
  CHALLENGE: "challenge",
  PASSED: "passed",
  FUNDED: "funded",
  PAYOUT_ELIGIBLE: "funded",
  PAYOUT_RECEIVED: "funded",
  FAILED: "failed",
  BREACHED: "failed",
  SUSPENDED: "inactive",
  ARCHIVED: "inactive",
};

export const ACTIVE_STATUSES: AccountStatus[] = ["CHALLENGE", "PASSED", "FUNDED", "PAYOUT_ELIGIBLE", "PAYOUT_RECEIVED"];

export const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = {
  ONE_STEP: "1-step evaluation",
  TWO_STEP: "2-step evaluation",
  THREE_STEP: "3-step evaluation",
  INSTANT_FUNDED: "Instant funding",
  FUNDED: "Funded",
  PERSONAL: "Personal / live",
  OTHER: "Other",
};

export const EVENT_LABEL: Record<AccountEventType, string> = {
  CHALLENGE_PURCHASED: "Challenge purchased",
  CHALLENGE_STARTED: "Challenge started",
  PHASE_PASSED: "Phase passed",
  CHALLENGE_PASSED: "Challenge passed",
  FUNDED_ACTIVATED: "Funded account activated",
  PAYOUT_REQUESTED: "Payout requested",
  PAYOUT_APPROVED: "Payout approved",
  PAYOUT_RECEIVED: "Payout received",
  PAYOUT_REJECTED: "Payout rejected",
  ACCOUNT_BREACHED: "Account breached",
  ACCOUNT_FAILED: "Account failed",
  ACCOUNT_RESET: "Account reset",
  ACCOUNT_SUSPENDED: "Account suspended",
  ACCOUNT_CLOSED: "Account closed",
  STATUS_CHANGED: "Status changed",
  NOTE: "Note",
};

export const FEE_LABEL: Record<FeeType, string> = {
  CHALLENGE: "Challenge fee",
  RESET: "Reset fee",
  ACTIVATION: "Activation fee",
  SUBSCRIPTION: "Subscription",
  DATA: "Data / platform",
  OTHER: "Other",
};

export const PAYOUT_STATUS_LABEL: Record<PayoutStatus, string> = {
  PENDING: "Pending",
  REQUESTED: "Requested",
  APPROVED: "Approved",
  PAID: "Paid",
  REJECTED: "Rejected",
};

export const CURRENCIES = ["USD", "EUR", "GBP", "CAD", "AUD", "CHF", "JPY"];
