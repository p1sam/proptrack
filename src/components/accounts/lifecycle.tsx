import Link from "next/link";
import { Check, ChevronRight, CircleDashed, Flag, XCircle } from "lucide-react";
import type { AccountLineage } from "@/server/queries/account-detail";
import type { AccountStatus } from "@/generated/prisma/enums";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { ACCOUNT_TYPE_LABEL, EVENT_LABEL, STATUS_LABEL } from "@/lib/labels";
import { StatusBadge } from "@/components/app/status-badge";
import { cn } from "@/lib/utils";
import { DeleteEventButton } from "./delete-buttons";

const EVAL_TYPES = new Set(["ONE_STEP", "TWO_STEP", "THREE_STEP", "OTHER"]);
const FUNDED_STATUSES: AccountStatus[] = ["FUNDED", "PAYOUT_ELIGIBLE", "PAYOUT_RECEIVED"];
const ENDED: AccountStatus[] = ["FAILED", "BREACHED"];

interface Stage {
  key: string;
  label: string;
  reached: boolean;
  skipped?: boolean;
  detail?: string;
}

export interface NextPayoutInfo {
  eligible: boolean;
  daysSinceLastPayout: number | null;
  frequencyDays: number | null;
}

/** Derive which lifecycle stages the chain has reached from statuses, events and payouts. */
export function lifecycleStages(lineage: AccountLineage, nextPayout: NextPayoutInfo | null): Stage[] {
  const { accounts, events, payouts } = lineage;
  const ev = new Set(events.map((e) => e.type));
  const hasEval = accounts.some((a) => EVAL_TYPES.has(a.accountType));
  const funded = accounts.some((a) => a.accountType === "FUNDED" || a.accountType === "INSTANT_FUNDED" || FUNDED_STATUSES.includes(a.status)) || ev.has("FUNDED_ACTIVATED");
  const passed = accounts.some((a) => a.status === "PASSED") || ev.has("PHASE_PASSED") || ev.has("CHALLENGE_PASSED") || (hasEval && funded);
  const paid = payouts.filter((p) => p.status === "PAID");
  const anyPayout = payouts.some((p) => p.status !== "REJECTED");
  const eligible =
    accounts.some((a) => a.status === "PAYOUT_ELIGIBLE" || a.status === "PAYOUT_RECEIVED") || anyPayout || !!nextPayout?.eligible || ev.has("PAYOUT_REQUESTED");
  const phases = accounts.filter((a) => EVAL_TYPES.has(a.accountType)).length;

  let nextDetail: string | undefined;
  if (paid.length >= 2) nextDetail = `${paid.length} payouts paid`;
  else if (nextPayout && funded) {
    if (nextPayout.eligible) nextDetail = "Eligible now";
    else if (nextPayout.frequencyDays !== null && nextPayout.daysSinceLastPayout !== null && nextPayout.daysSinceLastPayout < nextPayout.frequencyDays)
      nextDetail = `Window opens in ${nextPayout.frequencyDays - nextPayout.daysSinceLastPayout} d`;
  }

  return [
    { key: "CHALLENGE", label: "Challenge", reached: hasEval || ev.has("CHALLENGE_PURCHASED") || ev.has("CHALLENGE_STARTED"), skipped: !hasEval && funded, detail: phases > 1 ? `${phases} accounts` : undefined },
    { key: "PASSED", label: "Passed", reached: passed, skipped: !hasEval && funded },
    { key: "FUNDED", label: "Funded", reached: funded },
    { key: "ELIGIBLE", label: "Payout eligible", reached: eligible },
    { key: "PAYOUT", label: "Payout", reached: paid.length >= 1 || ev.has("PAYOUT_RECEIVED"), detail: paid.length === 1 ? "1 paid" : undefined },
    { key: "NEXT", label: "Next payout", reached: paid.length >= 2, detail: nextDetail },
  ];
}

export function LifecycleStrip({ lineage, currentId, nextPayout }: { lineage: AccountLineage; currentId: string; nextPayout: NextPayoutInfo | null }) {
  const stages = lifecycleStages(lineage, nextPayout);
  const lastReached = stages.reduce((m, s, i) => (s.reached ? i : m), -1);
  const latest = lineage.accounts.at(-1);
  const ended = latest && ENDED.includes(latest.status) ? latest : null;

  return (
    <div className="flex flex-col gap-4">
      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6" aria-label="Account lifecycle">
        {stages.map((s, i) => {
          const current = i === lastReached;
          return (
            <li
              key={s.key}
              aria-current={current ? "step" : undefined}
              className={cn(
                "flex items-start gap-2 rounded-md border px-3 py-2",
                s.reached ? "border-profit/40 bg-profit/10" : "border-dashed bg-muted/30",
                current && "ring-2 ring-profit/40",
              )}
            >
              <span className={cn("mt-0.5 shrink-0", s.reached ? "text-profit" : "text-muted-foreground")}>
                {s.reached ? <Check className="size-4" aria-hidden /> : <CircleDashed className="size-4" aria-hidden />}
              </span>
              <span className="min-w-0">
                <span className={cn("block text-sm font-medium", !s.reached && "text-muted-foreground")}>{s.label}</span>
                <span className="block text-[11px] text-muted-foreground">
                  {s.skipped ? "Skipped (instant/direct funding)" : s.reached ? (s.detail ?? (current ? "Current stage" : "Reached")) : (s.detail ?? "Not reached")}
                </span>
              </span>
            </li>
          );
        })}
      </ol>
      {ended && (
        <p className="flex items-center gap-1.5 text-sm text-loss">
          <XCircle className="size-4 shrink-0" aria-hidden /> Latest attempt ended: {STATUS_LABEL[ended.status]} ({ended.name}).
        </p>
      )}

      <div>
        <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Accounts in this chain</h3>
        <ol className="flex flex-wrap items-center gap-1.5">
          {lineage.accounts.map((a, i) => (
            <li key={a.id} className="flex items-center gap-1.5">
              {i > 0 && <ChevronRight className="size-3.5 text-muted-foreground" aria-hidden />}
              <Link
                href={`/accounts/${a.id}?tab=timeline`}
                aria-current={a.id === currentId ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2 rounded-md border px-2 py-1 text-sm hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  a.id === currentId && "border-primary/50 bg-primary/5 font-medium",
                )}
              >
                <span className="max-w-48 truncate">{a.name}</span>
                <StatusBadge status={a.status} />
              </Link>
            </li>
          ))}
        </ol>
        {lineage.accounts.length === 1 && <p className="mt-1 text-xs text-muted-foreground">Use “Advance” in the actions menu to continue this account into a next phase, a funded account or a new attempt.</p>}
      </div>
    </div>
  );
}

export function EventTimeline({ lineage, currentId, timezone }: { lineage: AccountLineage; currentId: string; timezone: string }) {
  const byId = new Map(lineage.accounts.map((a) => [a.id, a]));
  const multi = lineage.accounts.length > 1;
  if (!lineage.events.length) return <p className="text-sm text-muted-foreground">No events recorded yet.</p>;
  return (
    <ol className="relative flex flex-col gap-4 border-l pl-5">
      {lineage.events.map((e) => {
        const acc = byId.get(e.accountId);
        const negative = e.type === "ACCOUNT_BREACHED" || e.type === "ACCOUNT_FAILED" || e.type === "PAYOUT_REJECTED";
        const positive = e.type === "PHASE_PASSED" || e.type === "CHALLENGE_PASSED" || e.type === "FUNDED_ACTIVATED" || e.type === "PAYOUT_RECEIVED";
        return (
          <li key={e.id} className="relative">
            <span
              className={cn(
                "absolute top-1.5 -left-[25px] size-2.5 rounded-full border-2 border-card",
                negative ? "bg-loss" : positive ? "bg-profit" : e.type === "NOTE" ? "bg-muted-foreground" : "bg-chart-1",
              )}
              aria-hidden
            />
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
              <div className="flex flex-wrap items-center gap-x-2 text-sm font-medium">
                {positive && <Flag className="size-3.5 text-profit" aria-hidden />}
                {EVENT_LABEL[e.type]}
                {e.amount !== null && <span className="font-normal tabular text-muted-foreground">{formatMoney(e.amount, acc?.currency ?? "USD")}</span>}
                {e.fromStatus && e.toStatus && (
                  <span className="text-xs font-normal text-muted-foreground">
                    {STATUS_LABEL[e.fromStatus]} → {STATUS_LABEL[e.toStatus]}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground tabular">
                <time dateTime={e.occurredAt}>{formatDateTime(e.occurredAt, timezone)}</time>
                {e.type === "NOTE" && <DeleteEventButton id={e.id} />}
              </div>
            </div>
            {multi && acc && (
              <div className="text-xs text-muted-foreground">
                {acc.id === currentId ? (
                  <span>This account</span>
                ) : (
                  <Link href={`/accounts/${acc.id}?tab=timeline`} className="hover:underline">
                    {acc.name}
                  </Link>
                )}
                {" · "}
                {ACCOUNT_TYPE_LABEL[acc.accountType]}
              </div>
            )}
            {e.notes && <p className="mt-0.5 text-sm whitespace-pre-line text-muted-foreground">{e.notes}</p>}
          </li>
        );
      })}
    </ol>
  );
}

export function chainDates(lineage: AccountLineage, timezone: string) {
  const first = lineage.accounts[0];
  return first?.startedAt ? `since ${formatDate(first.startedAt, timezone)}` : undefined;
}
