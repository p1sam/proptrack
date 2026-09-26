"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createAccount, updateAccount } from "@/server/actions/accounts";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ACCOUNT_STATUSES, ACCOUNT_TYPE_LABEL, CURRENCIES, STATUS_LABEL } from "@/lib/labels";
import type { AccountStatus, AccountType } from "@/generated/prisma/enums";
import { RuleFields, hasAnyRule, ruleInputFrom, ruleStateFrom, type RuleFormState } from "./rule-fields";
import { FieldError, dateInputToIso, handleResult, isoToDateInput, todayInput, type FieldErrors } from "./form-utils";

export interface FirmOption {
  id: string;
  name: string;
  ruleTemplate?: Record<string, unknown> | null;
}

export interface AccountFormInitial {
  id: string;
  name: string;
  propFirmId: string | null;
  accountNumber: string | null;
  accountSize: number;
  startingBalance: number;
  currency: string;
  accountType: AccountType;
  phase: number | null;
  purchasedAt: string | null;
  startedAt: string | null;
  notes: string | null;
}

const NO_FIRM = "__none__";
const NEW_FIRM = "__new__";
const MULTI_STEP: AccountType[] = ["TWO_STEP", "THREE_STEP"];

interface State {
  firm: string;
  newFirmName: string;
  name: string;
  accountNumber: string;
  accountSize: string;
  startingBalance: string;
  currency: string;
  accountType: AccountType;
  phase: string;
  status: AccountStatus;
  challengeFee: string;
  purchasedAt: string;
  startedAt: string;
  notes: string;
}

function initialState(firms: FirmOption[], defaultCurrency: string, a?: AccountFormInitial): State {
  if (a) {
    return {
      firm: a.propFirmId ?? NO_FIRM,
      newFirmName: "",
      name: a.name,
      accountNumber: a.accountNumber ?? "",
      accountSize: String(a.accountSize),
      startingBalance: String(a.startingBalance),
      currency: a.currency,
      accountType: a.accountType,
      phase: a.phase === null ? "" : String(a.phase),
      status: "CHALLENGE",
      challengeFee: "",
      purchasedAt: isoToDateInput(a.purchasedAt),
      startedAt: isoToDateInput(a.startedAt),
      notes: a.notes ?? "",
    };
  }
  return {
    firm: firms.length ? firms[0].id : NEW_FIRM,
    newFirmName: "",
    name: "",
    accountNumber: "",
    accountSize: "",
    startingBalance: "",
    currency: defaultCurrency,
    accountType: "TWO_STEP",
    phase: "1",
    status: "CHALLENGE",
    challengeFee: "",
    purchasedAt: todayInput(),
    startedAt: todayInput(),
    notes: "",
  };
}

/**
 * Create or edit a trading account. In create mode it also captures the challenge fee and every
 * prop rule (with presets, or the firm's template). Status and rules of an existing account are
 * changed from the account page (status dialog, Rules tab) so the timeline stays accurate.
 */
export function AccountFormDialog({
  mode,
  firms,
  defaultCurrency = "USD",
  account,
  trigger,
  defaultOpen = false,
  clearParamOnClose,
  open: openProp,
  onOpenChange,
}: {
  mode: "create" | "edit";
  firms: FirmOption[];
  defaultCurrency?: string;
  account?: AccountFormInitial;
  trigger?: React.ReactNode;
  defaultOpen?: boolean;
  /** URL search param to remove when the dialog closes (e.g. "new" for ?new=1). */
  clearParamOnClose?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [openState, setOpenState] = useState(defaultOpen);
  const open = openProp ?? openState;
  const [st, setSt] = useState<State>(() => initialState(firms, defaultCurrency, account));
  const [rule, setRule] = useState<RuleFormState>(() => ruleStateFrom(firms.length && mode === "create" ? (firms[0].ruleTemplate as never) : null));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [pending, start] = useTransition();

  const setOpen = (v: boolean, opts: { keepUrl?: boolean } = {}) => {
    if (v) {
      setSt(initialState(firms, defaultCurrency, account));
      setRule(ruleStateFrom(mode === "create" && firms.length ? (firms[0].ruleTemplate as never) : null));
      setErrors({});
    }
    if (openProp === undefined) setOpenState(v);
    onOpenChange?.(v);
    if (!v && !opts.keepUrl && clearParamOnClose && params.has(clearParamOnClose)) {
      const sp = new URLSearchParams(params);
      sp.delete(clearParamOnClose);
      router.replace(`${pathname}${sp.size ? `?${sp}` : ""}`, { scroll: false });
    }
  };

  const set = <K extends keyof State>(k: K, v: State[K]) => setSt((s) => ({ ...s, [k]: v }));
  const err = (k: string) => errors[k];

  const onFirmChange = (v: string) => {
    set("firm", v);
    if (mode === "create") {
      const tpl = firms.find((f) => f.id === v)?.ruleTemplate;
      if (tpl && !hasAnyRule(rule)) setRule(ruleStateFrom(tpl as never));
    }
  };
  const selectedTemplate = firms.find((f) => f.id === st.firm)?.ruleTemplate;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const base = {
      name: st.name,
      propFirmId: st.firm === NO_FIRM || st.firm === NEW_FIRM ? null : st.firm,
      newPropFirmName: st.firm === NEW_FIRM ? st.newFirmName : null,
      accountNumber: st.accountNumber,
      accountSize: st.accountSize,
      startingBalance: st.startingBalance === "" ? null : st.startingBalance,
      currency: st.currency,
      accountType: st.accountType,
      phase: MULTI_STEP.includes(st.accountType) ? st.phase || "1" : null,
      purchasedAt: dateInputToIso(st.purchasedAt),
      startedAt: dateInputToIso(st.startedAt),
      notes: st.notes,
    };
    start(async () => {
      if (mode === "create") {
        const r = handleResult(
          await createAccount({ ...base, status: st.status, challengeFee: st.challengeFee, rule: hasAnyRule(rule) ? ruleInputFrom(rule) : undefined }),
          "Account created",
        );
        if (!r.ok) return setErrors(r.fieldErrors);
        setOpen(false, { keepUrl: true });
        router.push(`/accounts/${r.data.id}`);
      } else if (account) {
        const r = handleResult(await updateAccount({ ...base, id: account.id }), "Account updated");
        if (!r.ok) return setErrors(r.fieldErrors);
        setOpen(false);
        router.refresh();
      }
    });
  };

  const currencies = CURRENCIES.includes(st.currency) ? CURRENCIES : [st.currency, ...CURRENCIES];

  return (
    <Dialog open={open} onOpenChange={(v) => setOpen(v)}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "Add account" : "Edit account"}</DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? "Rules drive every progress bar, limit and warning for this account. Leave a rule blank if the account doesn't have it."
              : "Status changes, rules and fees are managed from the account page so the timeline stays accurate."}
          </DialogDescription>
        </DialogHeader>
        <form id="account-form" onSubmit={submit} className="flex flex-col gap-5">
          <fieldset className="grid gap-3 sm:grid-cols-2">
            <legend className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Account</legend>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="acc-firm">Prop firm</Label>
              <Select value={st.firm} onValueChange={onFirmChange}>
                <SelectTrigger id="acc-firm" className="w-full">
                  <SelectValue placeholder="Select a firm" />
                </SelectTrigger>
                <SelectContent>
                  {firms.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.name}
                    </SelectItem>
                  ))}
                  {firms.length > 0 && <SelectSeparator />}
                  <SelectItem value={NEW_FIRM}>New firm…</SelectItem>
                  <SelectItem value={NO_FIRM}>No firm (personal / broker)</SelectItem>
                </SelectContent>
              </Select>
              <FieldError errors={err("propFirmId")} />
            </div>
            {st.firm === NEW_FIRM ? (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="acc-newfirm">New firm name</Label>
                <Input id="acc-newfirm" value={st.newFirmName} onChange={(e) => set("newFirmName", e.target.value)} placeholder="e.g. FTMO" aria-invalid={!!err("newPropFirmName")} />
                <FieldError errors={err("newPropFirmName")} />
              </div>
            ) : (
              <div className="hidden sm:block" />
            )}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="acc-name">Name</Label>
              <Input id="acc-name" required value={st.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. FTMO 100K — Phase 1" aria-invalid={!!err("name")} />
              <FieldError errors={err("name")} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="acc-number">Account number</Label>
              <Input id="acc-number" value={st.accountNumber} onChange={(e) => set("accountNumber", e.target.value)} aria-invalid={!!err("accountNumber")} />
              <FieldError errors={err("accountNumber")} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="acc-size">Account size</Label>
              <Input id="acc-size" required type="number" min="0" step="any" inputMode="decimal" value={st.accountSize} onChange={(e) => set("accountSize", e.target.value)} aria-invalid={!!err("accountSize")} />
              <FieldError errors={err("accountSize")} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="acc-start">Starting balance</Label>
              <Input
                id="acc-start"
                type="number"
                min="0"
                step="any"
                inputMode="decimal"
                value={st.startingBalance}
                placeholder={st.accountSize ? `${st.accountSize} (account size)` : "Defaults to account size"}
                onChange={(e) => set("startingBalance", e.target.value)}
                aria-invalid={!!err("startingBalance")}
              />
              <FieldError errors={err("startingBalance")} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="acc-ccy">Currency</Label>
              <Select value={st.currency} onValueChange={(v) => set("currency", v)}>
                <SelectTrigger id="acc-ccy" className="w-full">
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
              <FieldError errors={err("currency")} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="acc-type">Account type</Label>
              <Select value={st.accountType} onValueChange={(v) => set("accountType", v as AccountType)}>
                <SelectTrigger id="acc-type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(ACCOUNT_TYPE_LABEL).map(([k, l]) => (
                    <SelectItem key={k} value={k}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {MULTI_STEP.includes(st.accountType) && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="acc-phase">Phase</Label>
                <Select value={st.phase || "1"} onValueChange={(v) => set("phase", v)}>
                  <SelectTrigger id="acc-phase" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(st.accountType === "THREE_STEP" ? ["1", "2", "3"] : ["1", "2"]).map((p) => (
                      <SelectItem key={p} value={p}>
                        Phase {p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldError errors={err("phase")} />
              </div>
            )}
            {mode === "create" && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="acc-status">Status</Label>
                <Select value={st.status} onValueChange={(v) => set("status", v as AccountStatus)}>
                  <SelectTrigger id="acc-status" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ACCOUNT_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {STATUS_LABEL[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {mode === "create" && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="acc-fee">Challenge fee ({st.currency})</Label>
                <Input id="acc-fee" type="number" min="0" step="any" inputMode="decimal" value={st.challengeFee} onChange={(e) => set("challengeFee", e.target.value)} aria-invalid={!!err("challengeFee")} />
                <FieldError errors={err("challengeFee")} />
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="acc-purchased">Purchase date</Label>
              <Input id="acc-purchased" type="date" value={st.purchasedAt} onChange={(e) => set("purchasedAt", e.target.value)} aria-invalid={!!err("purchasedAt")} />
              <FieldError errors={err("purchasedAt")} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="acc-started">Start date</Label>
              <Input id="acc-started" type="date" value={st.startedAt} onChange={(e) => set("startedAt", e.target.value)} aria-invalid={!!err("startedAt")} />
              <FieldError errors={err("startedAt")} />
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="acc-notes">Notes</Label>
              <Textarea id="acc-notes" rows={2} value={st.notes} onChange={(e) => set("notes", e.target.value)} />
            </div>
          </fieldset>

          {mode === "create" && (
            <div className="flex flex-col gap-2 border-t pt-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-sm font-semibold">Prop rules</h3>
                {selectedTemplate && (
                  <Button type="button" variant="link" size="xs" onClick={() => setRule(ruleStateFrom(selectedTemplate as never))}>
                    Use firm template
                  </Button>
                )}
              </div>
              <RuleFields value={rule} onChange={setRule} errors={errors} errorPrefix="rule." idPrefix="new-rule" currency={st.currency} />
              {!hasAnyRule(rule) && <p className="text-xs text-muted-foreground">No rules set — you can add them later from the account&apos;s Rules tab.</p>}
            </div>
          )}
        </form>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" form="account-form" disabled={pending}>
            {pending ? "Saving…" : mode === "create" ? "Create account" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
