"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Check, CircleX, MoreHorizontal, Pencil, Plus, Send, Trash2, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PayoutBadge } from "@/components/app/status-badge";
import { EmptyState } from "@/components/app/empty-state";
import { suggestAmountReceived } from "@/lib/calc/payouts";
import { fromZonedLocalInput, toZonedLocalInput } from "@/lib/datetime-local";
import { formatDate, formatMoney, formatPct } from "@/lib/format";
import { PAYOUT_STATUS_LABEL, STATUS_LABEL } from "@/lib/labels";
import { deletePayout, transitionPayout } from "@/server/actions/payouts";
import type { PayoutRowDTO } from "@/server/queries/payouts";
import { PayoutFormDialog, type PayoutAccountOption } from "./payout-form-dialog";

type Transition = "REQUESTED" | "APPROVED" | "PAID" | "REJECTED";
const NEXT: Record<PayoutRowDTO["status"], Transition[]> = {
  PENDING: ["REQUESTED", "REJECTED"],
  REQUESTED: ["APPROVED", "PAID", "REJECTED"],
  APPROVED: ["PAID", "REJECTED"],
  PAID: [],
  REJECTED: ["REQUESTED"],
};
const TRANSITION_LABEL: Record<Transition, string> = { REQUESTED: "Mark requested", APPROVED: "Mark approved", PAID: "Mark paid", REJECTED: "Mark rejected" };
const TRANSITION_ICON = { REQUESTED: Send, APPROVED: Check, PAID: Wallet, REJECTED: CircleX };

/** Payout table plus create/edit/transition/delete dialogs. `?new=1[&accounts=<id>]` opens the create dialog. */
export function PayoutsManager({
  rows,
  accounts,
  methods,
  timezone,
  openNew,
  defaultAccountId,
  filtered,
}: {
  rows: PayoutRowDTO[];
  accounts: PayoutAccountOption[];
  methods: string[];
  timezone: string;
  openNew: boolean;
  defaultAccountId: string | null;
  filtered: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [form, setForm] = useState<{ open: boolean; payout: PayoutRowDTO | null; accountId: string | null; key: number }>({ open: openNew, payout: null, accountId: defaultAccountId, key: 0 });
  const [transition, setTransition] = useState<{ payout: PayoutRowDTO; to: Transition } | null>(null);
  const [toDelete, setToDelete] = useState<PayoutRowDTO | null>(null);
  const [pending, start] = useTransition();

  const closeForm = (open: boolean) => {
    setForm((s) => ({ ...s, open }));
    if (!open && params.get("new")) {
      const sp = new URLSearchParams(params);
      sp.delete("new");
      router.replace(`${pathname}${sp.size ? `?${sp}` : ""}`, { scroll: false });
    }
  };
  const openCreate = (accountId: string | null = null) => setForm((s) => ({ open: true, payout: null, accountId, key: s.key + 1 }));
  const openEdit = (p: PayoutRowDTO) => setForm((s) => ({ open: true, payout: p, accountId: p.accountId, key: s.key + 1 }));

  return (
    <>
      <div className="flex items-center justify-between gap-2 pb-3">
        <p className="text-xs text-muted-foreground">
          {rows.length} payout{rows.length === 1 ? "" : "s"}
          {filtered ? " matching filters" : ""} · amounts in each payout’s own currency
        </p>
        <Button size="sm" onClick={() => openCreate(defaultAccountId)} disabled={!accounts.length}>
          <Plus /> Record payout
        </Button>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={<Wallet />}
          title={filtered ? "No payouts match these filters" : "No payouts yet"}
          description={filtered ? "Clear the filters to see all payouts." : "Record a payout request when you withdraw from a funded account. Requested amounts reduce the account balance; only paid payouts count as cash received."}
        />
      ) : (
        <div className="-mx-4 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Account</TableHead>
                <TableHead>Prop firm</TableHead>
                <TableHead>Requested</TableHead>
                <TableHead>Approved</TableHead>
                <TableHead>Paid</TableHead>
                <TableHead className="text-right">Amount requested</TableHead>
                <TableHead className="text-right">Split</TableHead>
                <TableHead className="text-right">Fees</TableHead>
                <TableHead className="text-right">Received</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead className="pr-4"><span className="sr-only">Actions</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="pl-4 font-medium whitespace-nowrap">{p.accountName}</TableCell>
                  <TableCell className="text-muted-foreground whitespace-nowrap">{p.firmName ?? "—"}</TableCell>
                  <TableCell className="tabular whitespace-nowrap">{formatDate(p.requestedAt, timezone)}</TableCell>
                  <TableCell className="tabular whitespace-nowrap">{formatDate(p.approvedAt, timezone)}</TableCell>
                  <TableCell className="tabular whitespace-nowrap">{formatDate(p.paidAt, timezone)}</TableCell>
                  <TableCell className="text-right tabular whitespace-nowrap">
                    {formatMoney(p.amountRequested, p.accountCurrency)}
                    {!p.deductFromBalance && <div className="text-[11px] text-muted-foreground">not deducted</div>}
                  </TableCell>
                  <TableCell className="text-right tabular">{p.profitSplitPct === null ? "—" : formatPct(p.profitSplitPct)}</TableCell>
                  <TableCell className="text-right tabular">{p.fees ? formatMoney(p.fees, p.currency) : "—"}</TableCell>
                  <TableCell className="text-right tabular whitespace-nowrap">{p.amountReceived === null ? "—" : <span className={p.status === "PAID" ? "text-profit" : undefined}>{formatMoney(p.amountReceived, p.currency)}</span>}</TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">{p.paymentMethod ?? "—"}</TableCell>
                  <TableCell>
                    <PayoutBadge status={p.status} />
                    {p.currency !== p.accountCurrency && <div className="mt-0.5 text-[11px] text-muted-foreground">paid in {p.currency}</div>}
                  </TableCell>
                  <TableCell className="max-w-48 truncate text-muted-foreground" title={p.notes ?? undefined}>{p.notes ?? ""}</TableCell>
                  <TableCell className="pr-4 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm" aria-label={`Actions for payout from ${p.accountName}`}>
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {NEXT[p.status].map((to) => {
                          const Icon = TRANSITION_ICON[to];
                          return (
                            <DropdownMenuItem key={to} onSelect={() => setTransition({ payout: p, to })}>
                              <Icon /> {TRANSITION_LABEL[to]}
                            </DropdownMenuItem>
                          );
                        })}
                        {NEXT[p.status].length > 0 && <DropdownMenuSeparator />}
                        <DropdownMenuItem onSelect={() => openEdit(p)}>
                          <Pencil /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem variant="destructive" onSelect={() => setToDelete(p)}>
                          <Trash2 /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {form.open && (
        <PayoutFormDialog key={form.key} open={form.open} onOpenChange={closeForm} payout={form.payout} defaultAccountId={form.accountId} accounts={accounts} methods={methods} timezone={timezone} />
      )}

      {transition && (
        <TransitionDialog
          key={`${transition.payout.id}-${transition.to}`}
          payout={transition.payout}
          to={transition.to}
          account={accounts.find((a) => a.id === transition.payout.accountId)}
          timezone={timezone}
          onClose={() => setTransition(null)}
        />
      )}

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this payout?</AlertDialogTitle>
            <AlertDialogDescription>
              {toDelete && (
                <>
                  {formatMoney(toDelete.amountRequested, toDelete.accountCurrency)} from {toDelete.accountName} ({PAYOUT_STATUS_LABEL[toDelete.status]}). Its timeline events are removed and the account balance is recalculated
                  {toDelete.deductFromBalance && toDelete.status !== "PENDING" && toDelete.status !== "REJECTED" ? " — the withdrawn amount is added back" : ""}. The account status is not changed.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={pending}
              onClick={(e) => {
                e.preventDefault();
                if (!toDelete) return;
                start(async () => {
                  const res = await deletePayout({ id: toDelete.id });
                  if (!res.ok) return void toast.error(res.error);
                  toast.success("Payout deleted");
                  setToDelete(null);
                });
              }}
            >
              {pending ? "Deleting…" : "Delete payout"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function TransitionDialog({ payout, to, account, timezone, onClose }: { payout: PayoutRowDTO; to: Transition; account?: PayoutAccountOption; timezone: string; onClose: () => void }) {
  const [pending, start] = useTransition();
  const [at, setAt] = useState(() => toZonedLocalInput(new Date(), timezone));
  const suggestion = payout.amountReceived ?? suggestAmountReceived(payout.amountRequested, payout.profitSplitPct, payout.fees);
  const [received, setReceived] = useState(suggestion === null ? "" : String(suggestion));
  const canMark = to === "PAID" && (account?.status === "FUNDED" || account?.status === "PAYOUT_ELIGIBLE");
  const [mark, setMark] = useState(true);
  const dateLabel = to === "PAID" ? "Payment date" : to === "APPROVED" ? "Approval date" : to === "REJECTED" ? "Rejection date" : "Request date";

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{TRANSITION_LABEL[to]}</DialogTitle>
          <DialogDescription>
            {payout.accountName} · {formatMoney(payout.amountRequested, payout.accountCurrency)} requested
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const date = fromZonedLocalInput(at, timezone);
            if (!date) return void toast.error("Enter a valid date");
            start(async () => {
              const res = await transitionPayout({ id: payout.id, to, at: date.toISOString(), amountReceived: to === "PAID" ? received : null, markAccountReceived: canMark && mark });
              if (!res.ok) return void toast.error(res.error);
              toast.success(`Payout marked ${PAYOUT_STATUS_LABEL[to].toLowerCase()}`, {
                description: res.data.accountStatusChanged ? `${payout.accountName} is now “${STATUS_LABEL.PAYOUT_RECEIVED}”.` : undefined,
              });
              onClose();
            });
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="tr-at">{dateLabel}</Label>
            <Input id="tr-at" type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} required />
          </div>
          {to === "PAID" && (
            <div className="grid gap-1.5">
              <Label htmlFor="tr-received">Amount received ({payout.currency})</Label>
              <Input id="tr-received" inputMode="decimal" value={received} onChange={(e) => setReceived(e.target.value)} required />
              <p className="text-xs text-muted-foreground">Suggested from requested × split − fees.</p>
              {Number(received) > payout.amountRequested && <p className="text-xs text-warning">Higher than the amount requested — double-check.</p>}
            </div>
          )}
          {to === "REJECTED" && <p className="text-xs text-muted-foreground">A rejected payout no longer reduces the account balance.</p>}
          {canMark && (
            <div className="flex items-start gap-2">
              <Checkbox id="tr-mark" checked={mark} onCheckedChange={(v) => setMark(v === true)} className="mt-0.5" />
              <Label htmlFor="tr-mark" className="font-normal leading-snug">
                Set the account status to “{STATUS_LABEL.PAYOUT_RECEIVED}”
              </Label>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : TRANSITION_LABEL[to]}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
