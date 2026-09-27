"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Lock, MoreHorizontal, Pencil, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { EmptyState } from "@/components/app/empty-state";
import { RULE_LABELS, type PersonalRuleType } from "@/lib/calc/personal-rules";
import { formatMinute } from "@/lib/calc/time";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { createTradingRule, deleteTradingRule, setTradingRuleFlags, updateTradingRule } from "@/server/actions/rules";
import type { TradingRuleDTO } from "@/server/queries/rules-personal";

const TYPES = Object.keys(RULE_LABELS) as PersonalRuleType[];

const HELP: Record<PersonalRuleType, { unit: string; placeholder: string; help: string }> = {
  MAX_RISK_PER_TRADE_PCT: { unit: "% of balance", placeholder: "1", help: "Initial risk (entry to stop × size) as a % of the account balance when the trade opened. Trades without a stop can't be checked." },
  MAX_TRADES_PER_DAY: { unit: "trades", placeholder: "4", help: "Trades opened per trading day (your timezone), per account." },
  MAX_LOSING_TRADES_PER_DAY: { unit: "losers", placeholder: "2", help: "Once this many trades lose in a day, any further trade that day breaks the rule." },
  MAX_CONSECUTIVE_LOSSES_PER_DAY: { unit: "losses in a row", placeholder: "2", help: "Stop trading for the day after this many consecutive losses." },
  MAX_DAILY_LOSS_PCT: { unit: "% of day-start balance", placeholder: "2", help: "Closed-trade loss for the day as a % of the balance at the day's first trade." },
  MAX_DAILY_LOSS_AMOUNT: { unit: "in account currency", placeholder: "500", help: "Closed-trade loss for the day, in each account's own currency." },
  MAX_POSITION_SIZE: { unit: "lots / contracts", placeholder: "2", help: "Largest quantity for a single trade." },
  TRADING_HOURS: { unit: "", placeholder: "", help: "Trades must open inside this window. A window that ends before it starts wraps past midnight." },
  MIN_MINUTES_BETWEEN_TRADES: { unit: "minutes", placeholder: "15", help: "Minimum gap between closing one trade and opening the next on the same day." },
};

export function describeRule(r: Pick<TradingRuleDTO, "type" | "value" | "startMinute" | "endMinute">): string {
  const v = r.value;
  switch (r.type) {
    case "MAX_RISK_PER_TRADE_PCT":
      return `Risk at most ${v}% per trade`;
    case "MAX_TRADES_PER_DAY":
      return `At most ${v} trades per day`;
    case "MAX_LOSING_TRADES_PER_DAY":
      return `Stop after ${v} losing trades in a day`;
    case "MAX_CONSECUTIVE_LOSSES_PER_DAY":
      return `Stop after ${v} consecutive losses`;
    case "MAX_DAILY_LOSS_PCT":
      return `Lose at most ${v}% in a day`;
    case "MAX_DAILY_LOSS_AMOUNT":
      return `Lose at most ${formatNumber(v)} per day (account currency)`;
    case "MAX_POSITION_SIZE":
      return `Position size at most ${v}`;
    case "TRADING_HOURS":
      return r.startMinute != null && r.endMinute != null ? `Only open trades ${formatMinute(r.startMinute)}–${formatMinute(r.endMinute)}` : "Trading hours";
    case "MIN_MINUTES_BETWEEN_TRADES":
      return `Wait ${v} min between trades`;
  }
}

export function TradingRulesManager({ rules, accounts, timezone }: { rules: TradingRuleDTO[]; accounts: { id: string; name: string }[]; timezone: string }) {
  const [editing, setEditing] = useState<{ rule: TradingRuleDTO | null; key: number } | null>(null);
  const [toDelete, setToDelete] = useState<TradingRuleDTO | null>(null);
  const [pending, start] = useTransition();

  const toggle = (r: TradingRuleDTO, patch: { isActive?: boolean; hardLimit?: boolean }) =>
    start(async () => {
      const res = await setTradingRuleFlags({ id: r.id, ...patch });
      if (!res.ok) return void toast.error(res.error);
      toast.success(patch.isActive !== undefined ? (patch.isActive ? "Rule activated — violations recalculated" : "Rule paused — violations recalculated") : patch.hardLimit ? "Hard limit on" : "Hard limit off");
    });

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3">
        <p className="max-w-2xl text-xs text-muted-foreground">
          Your own rules, checked on every trade in your timezone ({timezone}). Breaking one records a warning. Rules marked <span className="font-medium text-foreground">hard limit</span> also block entering a new manual trade that would break them; imports are never blocked.
        </p>
        <Button size="sm" onClick={() => setEditing({ rule: null, key: Date.now() })}>
          <Plus /> Add rule
        </Button>
      </div>
      {rules.length === 0 ? (
        <EmptyState icon={<ShieldCheck />} title="No personal rules yet" description="Add rules like “risk 1% per trade” or “stop after 2 losses”; PropTrack flags every trade that breaks them." />
      ) : (
        <ul className="-mx-4 divide-y border-t">
          {rules.map((r) => (
            <li key={r.id} className={cn("flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5", !r.isActive && "opacity-60")}>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
                  {describeRule(r)}
                  {r.hardLimit && (
                    <span className="inline-flex items-center gap-1 rounded-md border border-warning/30 bg-warning/15 px-1.5 py-0.5 text-[11px] font-medium text-warning">
                      <Lock className="size-3" aria-hidden /> Hard limit
                    </span>
                  )}
                  {!r.isActive && <span className="rounded-md border px-1.5 py-0.5 text-[11px] text-muted-foreground">Paused</span>}
                </div>
                <div className="text-xs text-muted-foreground">
                  {RULE_LABELS[r.type]} · {r.accountName ?? "All accounts"}
                </div>
              </div>
              <div className="w-32 text-right text-xs">
                <div className={cn("tabular", r.violations30d > 0 ? "text-warning" : "text-muted-foreground")}>{r.violations30d} in 30 days</div>
                <div className="text-muted-foreground tabular">{r.violationsTotal} all time</div>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={r.isActive} onCheckedChange={(v) => toggle(r, { isActive: v })} disabled={pending} aria-label={`${r.isActive ? "Pause" : "Activate"} rule: ${describeRule(r)}`} />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon-sm" aria-label={`Actions for rule: ${describeRule(r)}`}>
                      <MoreHorizontal />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => setEditing({ rule: r, key: Date.now() })}>
                      <Pencil /> Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => toggle(r, { hardLimit: !r.hardLimit })}>
                      <Lock /> {r.hardLimit ? "Turn hard limit off" : "Make hard limit"}
                    </DropdownMenuItem>
                    <DropdownMenuItem variant="destructive" onSelect={() => setToDelete(r)}>
                      <Trash2 /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing && <RuleDialog key={editing.key} rule={editing.rule} accounts={accounts} onClose={() => setEditing(null)} />}

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this rule?</AlertDialogTitle>
            <AlertDialogDescription>
              {toDelete ? `“${describeRule(toDelete)}” and its ${toDelete.violationsTotal} recorded violation${toDelete.violationsTotal === 1 ? "" : "s"} will be removed. Pause it instead to keep the history.` : ""}
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
                  const res = await deleteTradingRule({ id: toDelete.id });
                  if (!res.ok) return void toast.error(res.error);
                  toast.success("Rule deleted");
                  setToDelete(null);
                });
              }}
            >
              {pending ? "Deleting…" : "Delete rule"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function RuleDialog({ rule, accounts, onClose }: { rule: TradingRuleDTO | null; accounts: { id: string; name: string }[]; onClose: () => void }) {
  const [pending, start] = useTransition();
  const [type, setType] = useState<PersonalRuleType>(rule?.type ?? "MAX_RISK_PER_TRADE_PCT");
  const [value, setValue] = useState(rule?.value != null ? String(rule.value) : "");
  const [startT, setStartT] = useState(rule?.startMinute != null ? formatMinute(rule.startMinute) : "08:00");
  const [endT, setEndT] = useState(rule?.endMinute != null ? formatMinute(rule.endMinute) : "17:00");
  const [scope, setScope] = useState(rule?.accountId ?? "__all__");
  const [isActive, setIsActive] = useState(rule?.isActive ?? true);
  const [hardLimit, setHardLimit] = useState(rule?.hardLimit ?? false);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const hours = type === "TRADING_HOURS";
  const h = HELP[type];

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const payload = { type, value: hours ? null : value, start: hours ? startT : null, end: hours ? endT : null, accountId: scope === "__all__" ? null : scope, isActive, hardLimit };
    start(async () => {
      const res = rule ? await updateTradingRule({ ...payload, id: rule.id }) : await createTradingRule(payload);
      if (!res.ok) {
        setErrors(res.fieldErrors ?? {});
        toast.error(res.error);
        return;
      }
      toast.success(rule ? "Rule updated — violations recalculated" : "Rule added — past trades checked");
      onClose();
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{rule ? "Edit rule" : "Add trading rule"}</DialogTitle>
          <DialogDescription>Past trades are re-checked when you save.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4" noValidate>
          <div className="grid gap-1.5">
            <Label htmlFor="tr-type">Rule</Label>
            <Select value={type} onValueChange={(v) => setType(v as PersonalRuleType)}>
              <SelectTrigger id="tr-type" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {RULE_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{h.help}</p>
          </div>

          {hours ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="tr-start">From (HH:MM)</Label>
                <Input id="tr-start" type="time" value={startT} onChange={(e) => setStartT(e.target.value)} aria-invalid={!!errors.start} required />
                {errors.start && <p className="text-xs text-loss">{errors.start[0]}</p>}
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="tr-end">To (HH:MM)</Label>
                <Input id="tr-end" type="time" value={endT} onChange={(e) => setEndT(e.target.value)} aria-invalid={!!errors.end} required />
                {errors.end && <p className="text-xs text-loss">{errors.end[0]}</p>}
              </div>
            </div>
          ) : (
            <div className="grid gap-1.5">
              <Label htmlFor="tr-value">
                Limit <span className="font-normal text-muted-foreground">({h.unit})</span>
              </Label>
              <Input id="tr-value" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder={h.placeholder} aria-invalid={!!errors.value} required />
              {errors.value && <p className="text-xs text-loss">{errors.value[0]}</p>}
            </div>
          )}

          <div className="grid gap-1.5">
            <Label htmlFor="tr-scope">Applies to</Label>
            <Select value={scope} onValueChange={setScope}>
              <SelectTrigger id="tr-scope" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All accounts</SelectItem>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-start gap-3">
            <Switch id="tr-active" checked={isActive} onCheckedChange={setIsActive} className="mt-0.5" />
            <div className="grid gap-0.5">
              <Label htmlFor="tr-active">Active</Label>
              <p className="text-xs text-muted-foreground">Paused rules keep their settings but are not checked.</p>
            </div>
          </div>
          <div className="flex items-start gap-3 rounded-md border p-3">
            <Switch id="tr-hard" checked={hardLimit} onCheckedChange={setHardLimit} className="mt-0.5" />
            <div className="grid gap-0.5">
              <Label htmlFor="tr-hard">Hard limit</Label>
              <p className="text-xs text-muted-foreground">
                Off (default): breaking the rule only records a warning. On: PropTrack refuses to save a new manual trade that would break it — e.g. a 4th losing trade, or a trade outside your hours. Imported trades and edits of existing trades are never blocked, since they already happened.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : rule ? "Save rule" : "Add rule"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
