"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { AlertTriangle, CircleX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { payoutIssues, suggestAmountReceived, type PayoutStatusKey } from "@/lib/calc/payouts";
import { fromZonedLocalInput, toZonedLocalInput } from "@/lib/datetime-local";
import { formatMoney } from "@/lib/format";
import { CURRENCIES, PAYOUT_STATUS_LABEL, STATUS_LABEL } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { createPayout, updatePayout } from "@/server/actions/payouts";
import type { AccountStatus } from "@/generated/prisma/enums";
import type { PayoutRowDTO } from "@/server/queries/payouts";

export interface PayoutAccountOption {
  id: string;
  name: string;
  firmName: string | null;
  status: AccountStatus;
  funded: boolean;
  currency: string;
  profitSplitPct: number | null;
  eligibleProfit: number;
}

const STATUSES: PayoutStatusKey[] = ["PENDING", "REQUESTED", "APPROVED", "PAID", "REJECTED"];
const toNum = (s: string) => (s.trim() === "" || !Number.isFinite(Number(s.replace(/,/g, ""))) ? null : Number(s.replace(/,/g, "")));

interface FormState {
  accountId: string;
  status: PayoutStatusKey;
  requestedAt: string;
  approvedAt: string;
  paidAt: string;
  amountRequested: string;
  profitSplitPct: string;
  fees: string;
  amountReceived: string;
  paymentMethod: string;
  currency: string;
  deductFromBalance: boolean;
  notes: string;
  markAccountReceived: boolean;
}

function initialState(p: PayoutRowDTO | null, account: PayoutAccountOption | undefined, tz: string): FormState {
  const local = (d: string | null) => (d ? toZonedLocalInput(d, tz) : "");
  if (p)
    return {
      accountId: p.accountId,
      status: p.status,
      requestedAt: local(p.requestedAt),
      approvedAt: local(p.approvedAt),
      paidAt: local(p.paidAt),
      amountRequested: String(p.amountRequested),
      profitSplitPct: p.profitSplitPct === null ? "" : String(p.profitSplitPct),
      fees: p.fees ? String(p.fees) : "",
      amountReceived: p.amountReceived === null ? "" : String(p.amountReceived),
      paymentMethod: p.paymentMethod ?? "",
      currency: p.currency,
      deductFromBalance: p.deductFromBalance,
      notes: p.notes ?? "",
      markAccountReceived: true,
    };
  return {
    accountId: account?.id ?? "",
    status: "REQUESTED",
    requestedAt: toZonedLocalInput(new Date(), tz),
    approvedAt: "",
    paidAt: "",
    amountRequested: account && account.eligibleProfit > 0 ? String(Math.floor(account.eligibleProfit)) : "",
    profitSplitPct: account?.profitSplitPct != null ? String(account.profitSplitPct) : "",
    fees: "",
    amountReceived: "",
    paymentMethod: "",
    currency: account?.currency ?? "USD",
    deductFromBalance: true,
    notes: "",
    markAccountReceived: true,
  };
}

/**
 * Create / edit a payout. Mount with a `key` per payout so state resets between openings.
 * Errors (from the shared payoutIssues rules) block saving; warnings are advisory.
 */
export function PayoutFormDialog({
  open,
  onOpenChange,
  payout,
  defaultAccountId,
  accounts,
  methods,
  timezone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payout: PayoutRowDTO | null;
  defaultAccountId?: string | null;
  accounts: PayoutAccountOption[];
  methods: string[];
  timezone: string;
}) {
  const [pending, start] = useTransition();
  const defaultAccount = accounts.find((a) => a.id === defaultAccountId) ?? accounts.find((a) => a.funded) ?? accounts[0];
  const [f, setF] = useState<FormState>(() => initialState(payout, defaultAccount, timezone));
  const [receivedTouched, setReceivedTouched] = useState(!!payout && payout.amountReceived !== null);
  const [serverErrors, setServerErrors] = useState<Record<string, string[]>>({});
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((s) => ({ ...s, [k]: v }));
  const account = accounts.find((a) => a.id === f.accountId);
  const funded = accounts.filter((a) => a.funded);
  const others = accounts.filter((a) => !a.funded);

  const requested = toNum(f.amountRequested);
  const suggestion = suggestAmountReceived(requested, toNum(f.profitSplitPct), toNum(f.fees));
  const autoReceived = f.status === "PAID" && !receivedTouched;
  const receivedValue = autoReceived ? (suggestion === null ? "" : String(suggestion)) : f.amountReceived;
  const dates = {
    requestedAt: f.requestedAt ? fromZonedLocalInput(f.requestedAt, timezone) : null,
    approvedAt: f.approvedAt ? fromZonedLocalInput(f.approvedAt, timezone) : null,
    paidAt: f.paidAt ? fromZonedLocalInput(f.paidAt, timezone) : null,
  };
  const issues = useMemo(
    () => payoutIssues({ status: f.status, ...dates, amountRequested: requested, amountReceived: toNum(receivedValue) }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [f.status, f.requestedAt, f.approvedAt, f.paidAt, requested, receivedValue, timezone],
  );
  const errors = issues.filter((i) => i.level === "error");
  const warnings = issues.filter((i) => i.level === "warning");
  const fieldError = (k: string) => errors.find((e) => e.field === k)?.message ?? serverErrors[k]?.[0];
  const canMarkAccount = f.status === "PAID" && payout?.status !== "PAID" && (account?.status === "FUNDED" || account?.status === "PAYOUT_ELIGIBLE");

  const pickAccount = (id: string) => {
    const a = accounts.find((x) => x.id === id);
    setF((s) => ({
      ...s,
      accountId: id,
      currency: a?.currency ?? s.currency,
      profitSplitPct: a?.profitSplitPct != null ? String(a.profitSplitPct) : s.profitSplitPct,
    }));
  };

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (errors.length || !account) return;
    const payload = {
      accountId: f.accountId,
      status: f.status,
      requestedAt: dates.requestedAt?.toISOString() ?? null,
      approvedAt: dates.approvedAt?.toISOString() ?? null,
      paidAt: dates.paidAt?.toISOString() ?? null,
      amountRequested: f.amountRequested,
      profitSplitPct: f.profitSplitPct,
      fees: f.fees,
      amountReceived: receivedValue,
      paymentMethod: f.paymentMethod,
      currency: f.currency,
      deductFromBalance: f.deductFromBalance,
      notes: f.notes,
      markAccountReceived: canMarkAccount && f.markAccountReceived,
    };
    start(async () => {
      const res = payout ? await updatePayout({ ...payload, id: payout.id }) : await createPayout(payload);
      if (!res.ok) {
        setServerErrors(res.fieldErrors ?? {});
        toast.error(res.error);
        return;
      }
      toast.success(payout ? "Payout updated" : "Payout recorded", {
        description: res.data.accountStatusChanged ? `${account.name} is now marked “${STATUS_LABEL.PAYOUT_RECEIVED}”.` : undefined,
      });
      onOpenChange(false);
    });
  }

  const dateField = (k: "requestedAt" | "approvedAt" | "paidAt", label: string, required: boolean) => (
    <div className="grid gap-1.5">
      <Label htmlFor={`po-${k}`}>
        {label}
        {required && <span className="text-loss"> *</span>}
      </Label>
      <Input id={`po-${k}`} type="datetime-local" value={f[k]} onChange={(e) => set(k, e.target.value)} aria-invalid={!!fieldError(k)} aria-describedby={fieldError(k) ? `po-${k}-err` : undefined} />
      {fieldError(k) && (
        <p id={`po-${k}-err`} className="text-xs text-loss">
          {fieldError(k)}
        </p>
      )}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{payout ? "Edit payout" : "Record payout"}</DialogTitle>
          <DialogDescription>Dates are in your timezone ({timezone}). Only payouts marked Paid count as cash received.</DialogDescription>
        </DialogHeader>
        {accounts.length === 0 ? (
          <p className="text-sm text-muted-foreground">Add an account first.</p>
        ) : (
          <form onSubmit={submit} className="grid gap-4" noValidate>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="po-account">Account</Label>
                <Select value={f.accountId} onValueChange={pickAccount}>
                  <SelectTrigger id="po-account" className="w-full">
                    <SelectValue placeholder="Choose account" />
                  </SelectTrigger>
                  <SelectContent>
                    {funded.length > 0 && (
                      <SelectGroup>
                        <SelectLabel>Funded</SelectLabel>
                        {funded.map((a) => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.name}
                            {a.firmName ? ` · ${a.firmName}` : ""}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    )}
                    {others.length > 0 && (
                      <SelectGroup>
                        <SelectLabel>Other accounts</SelectLabel>
                        {others.map((a) => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.name} · {STATUS_LABEL[a.status]}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    )}
                  </SelectContent>
                </Select>
                {account && account.eligibleProfit > 0 && (
                  <p className="text-xs text-muted-foreground">Profit above starting balance: {formatMoney(account.eligibleProfit, account.currency)}</p>
                )}
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="po-status">Status</Label>
                <Select value={f.status} onValueChange={(v) => set("status", v as PayoutStatusKey)}>
                  <SelectTrigger id="po-status" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {PAYOUT_STATUS_LABEL[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Pending = drafted, not yet sent to the firm.</p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              {dateField("requestedAt", "Requested", f.status === "REQUESTED" || f.status === "REJECTED")}
              {dateField("approvedAt", "Approved", f.status === "APPROVED")}
              {dateField("paidAt", "Paid", f.status === "PAID")}
            </div>

            <div className="grid gap-4 sm:grid-cols-4">
              <div className="grid gap-1.5 sm:col-span-2">
                <Label htmlFor="po-requested">
                  Amount requested ({account?.currency ?? f.currency})<span className="text-loss"> *</span>
                </Label>
                <Input id="po-requested" inputMode="decimal" value={f.amountRequested} onChange={(e) => set("amountRequested", e.target.value)} aria-invalid={!!serverErrors.amountRequested} />
                <p className="text-xs text-muted-foreground">Gross amount withdrawn from the account, before the split.</p>
                {serverErrors.amountRequested && <p className="text-xs text-loss">{serverErrors.amountRequested[0]}</p>}
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="po-split">Profit split %</Label>
                <Input id="po-split" inputMode="decimal" value={f.profitSplitPct} onChange={(e) => set("profitSplitPct", e.target.value)} placeholder={account?.profitSplitPct != null ? String(account.profitSplitPct) : "e.g. 80"} />
                {serverErrors.profitSplitPct && <p className="text-xs text-loss">{serverErrors.profitSplitPct[0]}</p>}
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="po-fees">Fees</Label>
                <Input id="po-fees" inputMode="decimal" value={f.fees} onChange={(e) => set("fees", e.target.value)} placeholder="0" />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-4">
              <div className="grid gap-1.5 sm:col-span-2">
                <Label htmlFor="po-received">
                  Amount received ({f.currency}){f.status === "PAID" && <span className="text-loss"> *</span>}
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="po-received"
                    inputMode="decimal"
                    value={receivedValue}
                    onChange={(e) => {
                      setReceivedTouched(true);
                      set("amountReceived", e.target.value);
                    }}
                    placeholder={suggestion !== null ? String(suggestion) : ""}
                    aria-invalid={!!fieldError("amountReceived")}
                  />
                  {suggestion !== null && receivedValue !== String(suggestion) && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setReceivedTouched(true);
                        set("amountReceived", String(suggestion));
                      }}
                    >
                      Use {formatMoney(suggestion, f.currency)}
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Suggested: requested × split − fees{suggestion !== null ? ` = ${formatMoney(suggestion, f.currency)}` : ""}.{autoReceived ? " Filled automatically until you edit it." : ""}
                </p>
                {fieldError("amountReceived") && <p className="text-xs text-loss">{fieldError("amountReceived")}</p>}
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="po-method">Payment method</Label>
                <Input id="po-method" list="po-methods" value={f.paymentMethod} onChange={(e) => set("paymentMethod", e.target.value)} placeholder="Bank transfer" maxLength={64} />
                <datalist id="po-methods">
                  {methods.map((m) => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="po-currency">Currency received</Label>
                <Select value={f.currency} onValueChange={(v) => set("currency", v)}>
                  <SelectTrigger id="po-currency" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[...new Set([...(account ? [account.currency] : []), ...CURRENCIES, f.currency])].map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {account && f.currency !== account.currency && (
              <p className="-mt-2 text-xs text-warning">
                The amount received is recorded in {f.currency}; the requested amount is always debited from the account in {account.currency}.
              </p>
            )}

            <div className="flex items-start gap-3 rounded-md border p-3">
              <Switch id="po-deduct" checked={f.deductFromBalance} onCheckedChange={(v) => set("deductFromBalance", v)} className="mt-0.5" />
              <div className="grid gap-0.5">
                <Label htmlFor="po-deduct">Deduct from account balance</Label>
                <p className="text-xs text-muted-foreground">
                  When on, the requested amount is subtracted from the account balance from the request date (while requested, approved or paid). Most firms withdraw the money from the account, which lowers your balance but is not counted as a trading loss or drawdown. Turn off if the firm pays without reducing the balance.
                </p>
              </div>
            </div>

            {canMarkAccount && (
              <div className="flex items-start gap-3">
                <Checkbox id="po-mark" checked={f.markAccountReceived} onCheckedChange={(v) => set("markAccountReceived", v === true)} className="mt-0.5" />
                <Label htmlFor="po-mark" className="font-normal leading-snug">
                  Set {account?.name} to “{STATUS_LABEL.PAYOUT_RECEIVED}” (currently {account ? STATUS_LABEL[account.status] : ""})
                </Label>
              </div>
            )}

            <div className="grid gap-1.5">
              <Label htmlFor="po-notes">Notes</Label>
              <Textarea id="po-notes" value={f.notes} onChange={(e) => set("notes", e.target.value)} rows={2} maxLength={2000} />
            </div>

            {(errors.length > 0 || warnings.length > 0) && (
              <ul className="grid gap-1 text-xs" aria-live="polite">
                {errors
                  .filter((e) => !["requestedAt", "approvedAt", "paidAt", "amountReceived"].includes(e.field))
                  .map((e) => (
                    <li key={e.message} className="flex items-center gap-1.5 text-loss">
                      <CircleX className="size-3.5 shrink-0" /> {e.message}
                    </li>
                  ))}
                {warnings.map((w) => (
                  <li key={w.message} className="flex items-center gap-1.5 text-warning">
                    <AlertTriangle className="size-3.5 shrink-0" /> {w.message}
                  </li>
                ))}
              </ul>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending || errors.length > 0 || !account || !requested} className={cn(pending && "opacity-70")}>
                {pending ? "Saving…" : payout ? "Save changes" : "Record payout"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
