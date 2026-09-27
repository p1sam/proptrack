"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightCircle, BadgeCheck, CircleDollarSign, MoreHorizontal, Pencil, RefreshCcw, RotateCcw, StickyNote, Trash2 } from "lucide-react";
import { addAccountEvent, addFee, advanceAccount, changeAccountStatus, deleteAccount } from "@/server/actions/accounts";
import type { AccountEventType, AccountStatus, FeeType } from "@/generated/prisma/enums";
import { ACCOUNT_STATUSES, CURRENCIES, EVENT_LABEL, FEE_LABEL, STATUS_LABEL } from "@/lib/labels";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AccountFormDialog, type AccountFormInitial, type FirmOption } from "./account-form-dialog";
import { FieldError, dateInputToIso, dateTimeInputToIso, handleResult, nowInput, todayInput, type FieldErrors } from "./form-utils";

type AdvanceKind = "NEXT_PHASE" | "FUNDED" | "RESET";
type DialogKind = "edit" | "status" | "fee" | "event" | "delete" | AdvanceKind | null;

export interface ActionsAccount extends AccountFormInitial {
  status: AccountStatus;
  accountType: AccountFormInitial["accountType"];
}

const ADVANCE_COPY: Record<AdvanceKind, { title: string; description: string; nameSuffix: string; feeLabel: string; submit: string }> = {
  NEXT_PHASE: {
    title: "Passed → next phase",
    description: "Marks this account Passed and creates the next evaluation phase, linked in the lifecycle chain.",
    nameSuffix: "Phase",
    feeLabel: "Fee (optional)",
    submit: "Create next phase",
  },
  FUNDED: {
    title: "Passed → funded account",
    description: "Marks this account Passed and creates the funded account. Profit target and minimum days are dropped from the copied rules.",
    nameSuffix: "Funded",
    feeLabel: "Activation fee (optional)",
    submit: "Create funded account",
  },
  RESET: {
    title: "New attempt / reset",
    description: "Marks this attempt Failed (or keeps Breached) and starts a fresh attempt with the same size and rules.",
    nameSuffix: "Reset",
    feeLabel: "Reset fee",
    submit: "Start new attempt",
  },
};

function baseName(name: string) {
  return name.replace(/\s+[—-]\s+(Phase \d+|Funded|Reset|Retry).*$/i, "").trim() || name;
}

function AdvanceDialog({ kind, account, onDone }: { kind: AdvanceKind; account: ActionsAccount; onDone: (open: boolean) => void }) {
  const router = useRouter();
  const copy = ADVANCE_COPY[kind];
  const nextPhase = (account.phase ?? 1) + 1;
  const [name, setName] = useState(
    `${baseName(account.name)} — ${kind === "NEXT_PHASE" ? `Phase ${nextPhase}` : kind === "FUNDED" ? "Funded" : `${account.phase ? `Phase ${account.phase} ` : ""}(reset)`}`,
  );
  const [accountNumber, setAccountNumber] = useState("");
  const [startingBalance, setStartingBalance] = useState(String(account.accountSize));
  const [startedAt, setStartedAt] = useState(todayInput());
  const [fee, setFee] = useState("");
  const [keepRules, setKeepRules] = useState(true);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [pending, start] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const r = handleResult(
        await advanceAccount({ accountId: account.id, kind, name, accountNumber, startingBalance, startedAt: dateInputToIso(startedAt) ?? "", fee, keepRules }),
        kind === "RESET" ? "New attempt started" : kind === "FUNDED" ? "Funded account created" : "Next phase created",
      );
      if (!r.ok) return setErrors(r.fieldErrors);
      onDone(false);
      router.push(`/accounts/${r.data.id}`);
    });
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{copy.title}</DialogTitle>
        <DialogDescription>{copy.description}</DialogDescription>
      </DialogHeader>
      <form id="advance-form" onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="adv-name">New account name</Label>
          <Input id="adv-name" required value={name} onChange={(e) => setName(e.target.value)} aria-invalid={!!errors.name} />
          <FieldError errors={errors.name} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="adv-number">Account number</Label>
          <Input id="adv-number" value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="adv-balance">Starting balance ({account.currency})</Label>
          <Input id="adv-balance" required type="number" min="0" step="any" value={startingBalance} onChange={(e) => setStartingBalance(e.target.value)} aria-invalid={!!errors.startingBalance} />
          <FieldError errors={errors.startingBalance} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="adv-date">Start date</Label>
          <Input id="adv-date" required type="date" value={startedAt} onChange={(e) => setStartedAt(e.target.value)} aria-invalid={!!errors.startedAt} />
          <FieldError errors={errors.startedAt} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="adv-fee">
            {copy.feeLabel} ({account.currency})
          </Label>
          <Input id="adv-fee" type="number" min="0" step="any" value={fee} onChange={(e) => setFee(e.target.value)} aria-invalid={!!errors.fee} />
          <FieldError errors={errors.fee} />
        </div>
        <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 sm:col-span-2">
          <Label htmlFor="adv-keep">Copy this account&apos;s rules</Label>
          <Switch id="adv-keep" checked={keepRules} onCheckedChange={setKeepRules} />
        </div>
      </form>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onDone(false)} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" form="advance-form" disabled={pending}>
          {pending ? "Working…" : copy.submit}
        </Button>
      </DialogFooter>
    </>
  );
}

function StatusDialog({ account, onDone }: { account: ActionsAccount; onDone: (open: boolean) => void }) {
  const router = useRouter();
  const [status, setStatus] = useState<AccountStatus>(account.status);
  const [occurredAt, setOccurredAt] = useState(nowInput());
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [pending, start] = useTransition();
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const r = handleResult(await changeAccountStatus({ accountId: account.id, status, occurredAt: dateTimeInputToIso(occurredAt) ?? "", notes }), "Status updated");
      if (!r.ok) return setErrors(r.fieldErrors);
      onDone(false);
      router.refresh();
    });
  };
  return (
    <>
      <DialogHeader>
        <DialogTitle>Change status</DialogTitle>
        <DialogDescription>Recorded on the timeline. To continue into a new phase or funded account, use the Advance actions instead.</DialogDescription>
      </DialogHeader>
      <form id="status-form" onSubmit={submit} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="st-status">New status</Label>
          <Select value={status} onValueChange={(v) => setStatus(v as AccountStatus)}>
            <SelectTrigger id="st-status" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ACCOUNT_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {STATUS_LABEL[s]}
                  {s === account.status ? " (current)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="st-date">When</Label>
          <Input id="st-date" type="datetime-local" required value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} aria-invalid={!!errors.occurredAt} />
          <FieldError errors={errors.occurredAt} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="st-notes">Notes</Label>
          <Textarea id="st-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </form>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onDone(false)} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" form="status-form" disabled={pending || status === account.status}>
          {pending ? "Saving…" : "Update status"}
        </Button>
      </DialogFooter>
    </>
  );
}

function FeeDialog({ account, onDone }: { account: ActionsAccount; onDone: (open: boolean) => void }) {
  const router = useRouter();
  const [type, setType] = useState<FeeType>("RESET");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState(account.currency);
  const [paidAt, setPaidAt] = useState(todayInput());
  const [refunded, setRefunded] = useState("");
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [pending, start] = useTransition();
  const currencies = CURRENCIES.includes(currency) ? CURRENCIES : [currency, ...CURRENCIES];
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const r = handleResult(await addFee({ accountId: account.id, type, amount, currency, paidAt: dateInputToIso(paidAt) ?? "", refunded, notes }), "Fee added");
      if (!r.ok) return setErrors(r.fieldErrors);
      onDone(false);
      router.refresh();
    });
  };
  return (
    <>
      <DialogHeader>
        <DialogTitle>Add fee</DialogTitle>
        <DialogDescription>Fees are the cash cost of this account and feed the ROI and net cash flow figures.</DialogDescription>
      </DialogHeader>
      <form id="fee-form" onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="fee-type">Type</Label>
          <Select value={type} onValueChange={(v) => setType(v as FeeType)}>
            <SelectTrigger id="fee-type" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(FEE_LABEL).map(([k, l]) => (
                <SelectItem key={k} value={k}>
                  {l}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="fee-date">Paid on</Label>
          <Input id="fee-date" type="date" required value={paidAt} onChange={(e) => setPaidAt(e.target.value)} aria-invalid={!!errors.paidAt} />
          <FieldError errors={errors.paidAt} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="fee-amount">Amount</Label>
          <Input id="fee-amount" type="number" min="0" step="any" required value={amount} onChange={(e) => setAmount(e.target.value)} aria-invalid={!!errors.amount} />
          <FieldError errors={errors.amount} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="fee-ccy">Currency</Label>
          <Select value={currency} onValueChange={setCurrency}>
            <SelectTrigger id="fee-ccy" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {currencies.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="fee-refund">Refunded (optional)</Label>
          <Input id="fee-refund" type="number" min="0" step="any" value={refunded} onChange={(e) => setRefunded(e.target.value)} aria-invalid={!!errors.refunded} />
          <FieldError errors={errors.refunded} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="fee-notes">Notes</Label>
          <Input id="fee-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        {type === "RESET" && <p className="text-xs text-muted-foreground sm:col-span-2">A reset fee also adds an “Account reset” event to the timeline.</p>}
      </form>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onDone(false)} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" form="fee-form" disabled={pending}>
          {pending ? "Saving…" : "Add fee"}
        </Button>
      </DialogFooter>
    </>
  );
}

const EVENT_TYPES = Object.keys(EVENT_LABEL) as AccountEventType[];

/** Add-event form; used in the actions menu and inline on the Timeline tab. */
export function EventForm({ accountId, currency, onDone, formId = "event-form" }: { accountId: string; currency: string; onDone?: () => void; formId?: string }) {
  const router = useRouter();
  const [type, setType] = useState<AccountEventType>("NOTE");
  const [occurredAt, setOccurredAt] = useState(() => nowInput());
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [pending, start] = useTransition();
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const r = handleResult(await addAccountEvent({ accountId, type, occurredAt: dateTimeInputToIso(occurredAt) ?? "", amount, notes }), "Event added");
      if (!r.ok) return setErrors(r.fieldErrors);
      setNotes("");
      setAmount("");
      setErrors({});
      onDone?.();
      router.refresh();
    });
  };
  return (
    <form id={formId} onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${formId}-type`}>Event</Label>
        <Select value={type} onValueChange={(v) => setType(v as AccountEventType)}>
          <SelectTrigger id={`${formId}-type`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {EVENT_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {EVENT_LABEL[t]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${formId}-date`}>When</Label>
        <Input id={`${formId}-date`} type="datetime-local" required value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} aria-invalid={!!errors.occurredAt} />
        <FieldError errors={errors.occurredAt} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${formId}-amount`}>Amount ({currency}, optional)</Label>
        <Input id={`${formId}-amount`} type="number" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} aria-invalid={!!errors.amount} />
        <FieldError errors={errors.amount} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${formId}-notes`}>Notes</Label>
        <Input id={`${formId}-notes`} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={type === "NOTE" ? "What happened?" : undefined} />
      </div>
      <p className="text-xs text-muted-foreground sm:col-span-2">Timeline events are records only; they don&apos;t change the account&apos;s status, balance or rules.</p>
      <div className="sm:col-span-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Adding…" : "Add event"}
        </Button>
      </div>
    </form>
  );
}

function DeleteDialog({ account, onDone }: { account: ActionsAccount; onDone: (open: boolean) => void }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState("");
  const [pending, start] = useTransition();
  const matches = confirm.trim() === account.name;
  return (
    <>
      <DialogHeader>
        <DialogTitle>Delete {account.name}?</DialogTitle>
        <DialogDescription>
          This permanently deletes the account with all its trades, journals, fees, payouts, events and rule violations. It cannot be undone. Consider changing the status to Archived instead.
        </DialogDescription>
      </DialogHeader>
      <form
        id="delete-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!matches) return;
          start(async () => {
            const r = handleResult(await deleteAccount({ id: account.id, confirmName: confirm }), "Account deleted");
            if (!r.ok) return;
            onDone(false);
            router.push("/accounts");
          });
        }}
        className="flex flex-col gap-1.5"
      >
        <Label htmlFor="del-confirm">
          Type <span className="font-semibold">{account.name}</span> to confirm
        </Label>
        <Input id="del-confirm" autoComplete="off" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </form>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onDone(false)} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" form="delete-form" variant="destructive" disabled={!matches || pending}>
          {pending ? "Deleting…" : "Delete account"}
        </Button>
      </DialogFooter>
    </>
  );
}

/** The account page's actions menu. Every item opens a real form wired to a server action. */
export function AccountActionsMenu({ account, firms }: { account: ActionsAccount; firms: FirmOption[] }) {
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [key, setKey] = useState(0);
  const open = (d: DialogKind) => {
    setKey((k) => k + 1);
    setDialog(d);
  };
  const close = (v: boolean) => !v && setDialog(null);
  const isEval = account.status === "CHALLENGE" || account.status === "PASSED";
  const maxPhase = account.accountType === "THREE_STEP" ? 3 : account.accountType === "TWO_STEP" ? 2 : 1;
  const canNextPhase = isEval && (account.phase ?? 1) < maxPhase;

  return (
    <>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => open("edit")}>
          <Pencil /> Edit
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" aria-label="More account actions">
              <MoreHorizontal /> Actions
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuItem onSelect={() => open("status")}>
              <RefreshCcw /> Change status
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-muted-foreground">Advance</DropdownMenuLabel>
            <DropdownMenuItem disabled={!canNextPhase} onSelect={() => open("NEXT_PHASE")}>
              <ArrowRightCircle /> Passed → next phase
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!isEval} onSelect={() => open("FUNDED")}>
              <BadgeCheck /> Passed → funded account
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => open("RESET")}>
              <RotateCcw /> New attempt / reset
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => open("fee")}>
              <CircleDollarSign /> Add fee
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => open("event")}>
              <StickyNote /> Add event
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => open("delete")}>
              <Trash2 /> Delete account
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <AccountFormDialog key={`edit-${key}`} mode="edit" firms={firms} account={account} open={dialog === "edit"} onOpenChange={close} />

      <Dialog open={dialog !== null && dialog !== "edit"} onOpenChange={close}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
          {dialog === "status" && <StatusDialog key={key} account={account} onDone={close} />}
          {dialog === "fee" && <FeeDialog key={key} account={account} onDone={close} />}
          {dialog === "delete" && <DeleteDialog key={key} account={account} onDone={close} />}
          {(dialog === "NEXT_PHASE" || dialog === "FUNDED" || dialog === "RESET") && <AdvanceDialog key={`${dialog}-${key}`} kind={dialog} account={account} onDone={close} />}
          {dialog === "event" && (
            <>
              <DialogHeader>
                <DialogTitle>Add timeline event</DialogTitle>
                <DialogDescription>Record something that happened to this account.</DialogDescription>
              </DialogHeader>
              <EventForm key={key} accountId={account.id} currency={account.currency} formId="menu-event" onDone={() => close(false)} />
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
