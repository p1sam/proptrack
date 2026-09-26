import { cn } from "@/lib/utils";
import { STATUS_LABEL, PAYOUT_STATUS_LABEL } from "@/lib/labels";
import type { AccountStatus, PayoutStatus } from "@/generated/prisma/enums";

const STATUS_STYLE: Record<AccountStatus, string> = {
  CHALLENGE: "bg-chart-1/15 text-chart-1 border-chart-1/30",
  PASSED: "bg-chart-3/15 text-chart-3 border-chart-3/30",
  FUNDED: "bg-profit/15 text-profit border-profit/30",
  PAYOUT_ELIGIBLE: "bg-profit/15 text-profit border-profit/30",
  PAYOUT_RECEIVED: "bg-profit/15 text-profit border-profit/30",
  FAILED: "bg-loss/15 text-loss border-loss/30",
  BREACHED: "bg-loss/15 text-loss border-loss/30",
  SUSPENDED: "bg-warning/15 text-warning border-warning/30",
  ARCHIVED: "bg-muted text-muted-foreground border-border",
};

export function StatusBadge({ status, className }: { status: AccountStatus; className?: string }) {
  return <span className={cn("inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap", STATUS_STYLE[status], className)}>{STATUS_LABEL[status]}</span>;
}

const PAYOUT_STYLE: Record<PayoutStatus, string> = {
  PENDING: "bg-muted text-muted-foreground border-border",
  REQUESTED: "bg-chart-1/15 text-chart-1 border-chart-1/30",
  APPROVED: "bg-chart-3/15 text-chart-3 border-chart-3/30",
  PAID: "bg-profit/15 text-profit border-profit/30",
  REJECTED: "bg-loss/15 text-loss border-loss/30",
};

export function PayoutBadge({ status }: { status: PayoutStatus }) {
  return <span className={cn("inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px] font-medium", PAYOUT_STYLE[status])}>{PAYOUT_STATUS_LABEL[status]}</span>;
}
