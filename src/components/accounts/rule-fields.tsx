"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import type { RuleInput } from "@/lib/validation/account";
import { cn } from "@/lib/utils";
import { DAILY_BASIS_LABEL, DRAWDOWN_TYPE_LABEL } from "./rule-labels";

/** Rule form state: numeric inputs are kept as strings ("" = no rule); zod parses them. */
export interface RuleFormState {
  profitTargetPct: string;
  maxDailyLossPct: string;
  dailyLossBasis: "STARTING_BALANCE" | "DAY_START_BALANCE";
  maxOverallLossPct: string;
  drawdownType: "STATIC" | "TRAILING_EOD" | "TRAILING_BALANCE";
  trailingLocksAtStart: boolean;
  minTradingDays: string;
  maxTradingDays: string;
  maxPositionSize: string;
  maxOpenContracts: string;
  consistencyPct: string;
  payoutThresholdAmount: string;
  payoutFrequencyDays: string;
  profitSplitPct: string;
  weekendHoldingAllowed: boolean;
  newsTradingAllowed: boolean;
  dayResetHour: string;
  dayResetTimezone: string;
}

type EnumOrBoolKeys = "dailyLossBasis" | "drawdownType" | "trailingLocksAtStart" | "weekendHoldingAllowed" | "newsTradingAllowed";
type RuleLike = Partial<{ [K in Exclude<keyof RuleFormState, EnumOrBoolKeys>]: number | string | null } & Pick<RuleFormState, EnumOrBoolKeys>>;

const s = (v: number | string | null | undefined) => (v === null || v === undefined ? "" : String(v));

export function emptyRuleState(): RuleFormState {
  return {
    profitTargetPct: "",
    maxDailyLossPct: "",
    dailyLossBasis: "STARTING_BALANCE",
    maxOverallLossPct: "",
    drawdownType: "STATIC",
    trailingLocksAtStart: true,
    minTradingDays: "",
    maxTradingDays: "",
    maxPositionSize: "",
    maxOpenContracts: "",
    consistencyPct: "",
    payoutThresholdAmount: "",
    payoutFrequencyDays: "",
    profitSplitPct: "",
    weekendHoldingAllowed: true,
    newsTradingAllowed: true,
    dayResetHour: "0",
    dayResetTimezone: "",
  };
}

export function ruleStateFrom(rule: RuleLike | null | undefined): RuleFormState {
  const e = emptyRuleState();
  if (!rule) return e;
  return {
    profitTargetPct: s(rule.profitTargetPct),
    maxDailyLossPct: s(rule.maxDailyLossPct),
    dailyLossBasis: rule.dailyLossBasis ?? e.dailyLossBasis,
    maxOverallLossPct: s(rule.maxOverallLossPct),
    drawdownType: rule.drawdownType ?? e.drawdownType,
    trailingLocksAtStart: rule.trailingLocksAtStart ?? e.trailingLocksAtStart,
    minTradingDays: s(rule.minTradingDays),
    maxTradingDays: s(rule.maxTradingDays),
    maxPositionSize: s(rule.maxPositionSize),
    maxOpenContracts: s(rule.maxOpenContracts),
    consistencyPct: s(rule.consistencyPct),
    payoutThresholdAmount: s(rule.payoutThresholdAmount),
    payoutFrequencyDays: s(rule.payoutFrequencyDays),
    profitSplitPct: s(rule.profitSplitPct),
    weekendHoldingAllowed: rule.weekendHoldingAllowed ?? e.weekendHoldingAllowed,
    newsTradingAllowed: rule.newsTradingAllowed ?? e.newsTradingAllowed,
    dayResetHour: s(rule.dayResetHour ?? 0) || "0",
    dayResetTimezone: s(rule.dayResetTimezone),
  };
}

export function ruleInputFrom(st: RuleFormState): RuleInput {
  return { ...st, dayResetHour: st.dayResetHour === "" ? 0 : st.dayResetHour };
}

export function hasAnyRule(st: RuleFormState) {
  return !!(
    st.profitTargetPct ||
    st.maxDailyLossPct ||
    st.maxOverallLossPct ||
    st.minTradingDays ||
    st.maxTradingDays ||
    st.maxPositionSize ||
    st.maxOpenContracts ||
    st.consistencyPct ||
    st.payoutThresholdAmount ||
    st.payoutFrequencyDays ||
    st.profitSplitPct ||
    !st.weekendHoldingAllowed ||
    !st.newsTradingAllowed ||
    st.dayResetTimezone ||
    (st.dayResetHour && st.dayResetHour !== "0")
  );
}

export const RULE_PRESETS: { label: string; description: string; rule: Partial<RuleFormState> }[] = [
  {
    label: "8% / 5% / 10% static",
    description: "Classic 2-step evaluation: 8% target, 5% daily loss of starting balance, 10% static max loss, 4 min days.",
    rule: { profitTargetPct: "8", maxDailyLossPct: "5", dailyLossBasis: "STARTING_BALANCE", maxOverallLossPct: "10", drawdownType: "STATIC", minTradingDays: "4" },
  },
  {
    label: "10% / 5% / 10% static",
    description: "1-step or phase-1 style: 10% target, 5% daily, 10% static.",
    rule: { profitTargetPct: "10", maxDailyLossPct: "5", dailyLossBasis: "STARTING_BALANCE", maxOverallLossPct: "10", drawdownType: "STATIC" },
  },
  {
    label: "10% / 4% / 6% trailing EOD",
    description: "Trailing end-of-day drawdown of 6% that locks at the starting balance, 4% daily loss.",
    rule: { profitTargetPct: "10", maxDailyLossPct: "4", dailyLossBasis: "DAY_START_BALANCE", maxOverallLossPct: "6", drawdownType: "TRAILING_EOD", trailingLocksAtStart: true },
  },
  {
    label: "6% / — / 4% trailing intraday",
    description: "Futures-style: 6% target, no daily loss, 4% trailing closed-balance drawdown.",
    rule: { profitTargetPct: "6", maxDailyLossPct: "", maxOverallLossPct: "4", drawdownType: "TRAILING_BALANCE", trailingLocksAtStart: true },
  },
  {
    label: "Funded 5% / 10%, 80% split",
    description: "Funded account: no target, 5% daily, 10% static, 80% profit split, payouts every 14 days.",
    rule: { profitTargetPct: "", minTradingDays: "", maxDailyLossPct: "5", maxOverallLossPct: "10", drawdownType: "STATIC", profitSplitPct: "80", payoutFrequencyDays: "14" },
  },
];

type FieldErrors = Record<string, string[] | undefined> | undefined;

function NumField({
  id,
  label,
  value,
  onChange,
  suffix,
  error,
  hint,
  step = "any",
  min = "0",
  max,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  suffix?: string;
  error?: string[];
  hint?: string;
  step?: string;
  min?: string;
  max?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          inputMode="decimal"
          type="number"
          step={step}
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={!!error?.length}
          aria-describedby={error?.length ? `${id}-err` : hint ? `${id}-hint` : undefined}
          className={cn(suffix && "pr-10")}
        />
        {suffix && <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-xs text-muted-foreground">{suffix}</span>}
      </div>
      {error?.length ? (
        <p id={`${id}-err`} className="text-xs text-destructive">
          {error[0]}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function SwitchField({ id, label, checked, onChange, hint }: { id: string; label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-md border px-3 py-2">
      <div className="flex flex-col gap-0.5">
        <Label htmlFor={id}>{label}</Label>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

/**
 * Every prop-rule field. `errorPrefix` maps zod field errors (e.g. "rule.maxDailyLossPct") to inputs.
 * Blank numeric fields mean "no such rule".
 */
export function RuleFields({
  value,
  onChange,
  errors,
  errorPrefix = "",
  idPrefix = "rule",
  currency,
  showPresets = true,
}: {
  value: RuleFormState;
  onChange: (next: RuleFormState) => void;
  errors?: FieldErrors;
  errorPrefix?: string;
  idPrefix?: string;
  currency?: string;
  showPresets?: boolean;
}) {
  const set = <K extends keyof RuleFormState>(k: K, v: RuleFormState[K]) => onChange({ ...value, [k]: v });
  const err = (k: keyof RuleFormState) => errors?.[`${errorPrefix}${k}`];
  const fid = (k: string) => `${idPrefix}-${k}`;
  const trailing = value.drawdownType !== "STATIC";
  return (
    <div className="flex flex-col gap-4">
      {showPresets && (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">Presets (target / daily / max loss)</span>
          <div className="flex flex-wrap gap-1.5">
            {RULE_PRESETS.map((p) => (
              <Button key={p.label} type="button" variant="outline" size="xs" title={p.description} onClick={() => onChange({ ...value, ...p.rule })}>
                {p.label}
              </Button>
            ))}
          </div>
        </div>
      )}

      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Target &amp; loss limits</legend>
        <NumField id={fid("target")} label="Profit target" suffix="%" value={value.profitTargetPct} onChange={(v) => set("profitTargetPct", v)} error={err("profitTargetPct")} max="100" hint="Blank for funded accounts." />
        <div className="hidden sm:block" />
        <NumField id={fid("daily")} label="Max daily loss" suffix="%" value={value.maxDailyLossPct} onChange={(v) => set("maxDailyLossPct", v)} error={err("maxDailyLossPct")} max="100" />
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={fid("basis")}>Daily loss measured on</Label>
          <Select value={value.dailyLossBasis} onValueChange={(v) => set("dailyLossBasis", v as RuleFormState["dailyLossBasis"])}>
            <SelectTrigger id={fid("basis")} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(DAILY_BASIS_LABEL).map(([k, l]) => (
                <SelectItem key={k} value={k}>
                  {l}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <NumField id={fid("overall")} label="Max overall loss" suffix="%" value={value.maxOverallLossPct} onChange={(v) => set("maxOverallLossPct", v)} error={err("maxOverallLossPct")} max="100" />
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={fid("ddtype")}>Drawdown type</Label>
          <Select value={value.drawdownType} onValueChange={(v) => set("drawdownType", v as RuleFormState["drawdownType"])}>
            <SelectTrigger id={fid("ddtype")} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(DRAWDOWN_TYPE_LABEL).map(([k, l]) => (
                <SelectItem key={k} value={k}>
                  {l}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {trailing && (
          <div className="sm:col-span-2">
            <SwitchField
              id={fid("locks")}
              label="Trailing floor locks at starting balance"
              hint="Once the floor reaches the starting balance it stops rising."
              checked={value.trailingLocksAtStart}
              onChange={(v) => set("trailingLocksAtStart", v)}
            />
          </div>
        )}
      </fieldset>

      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Trading constraints</legend>
        <NumField id={fid("mindays")} label="Min trading days" value={value.minTradingDays} onChange={(v) => set("minTradingDays", v)} error={err("minTradingDays")} step="1" />
        <NumField id={fid("maxdays")} label="Max trading days" value={value.maxTradingDays} onChange={(v) => set("maxTradingDays", v)} error={err("maxTradingDays")} step="1" min="1" />
        <NumField id={fid("maxpos")} label="Max position size" suffix="qty" value={value.maxPositionSize} onChange={(v) => set("maxPositionSize", v)} error={err("maxPositionSize")} hint="Lots / contracts per trade." />
        <NumField id={fid("consistency")} label="Consistency limit" suffix="%" value={value.consistencyPct} onChange={(v) => set("consistencyPct", v)} error={err("consistencyPct")} max="100" hint="Best day ≤ this % of total profit." />
        <SwitchField id={fid("weekend")} label="Weekend holding allowed" checked={value.weekendHoldingAllowed} onChange={(v) => set("weekendHoldingAllowed", v)} />
        <SwitchField id={fid("news")} label="News trading allowed" checked={value.newsTradingAllowed} onChange={(v) => set("newsTradingAllowed", v)} hint="Recorded only; not checked automatically." />
      </fieldset>

      <fieldset className="grid gap-3 sm:grid-cols-3">
        <legend className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Payouts</legend>
        <NumField id={fid("threshold")} label="Payout threshold" suffix={currency} value={value.payoutThresholdAmount} onChange={(v) => set("payoutThresholdAmount", v)} error={err("payoutThresholdAmount")} />
        <NumField id={fid("freq")} label="Payout frequency" suffix="days" value={value.payoutFrequencyDays} onChange={(v) => set("payoutFrequencyDays", v)} error={err("payoutFrequencyDays")} step="1" />
        <NumField id={fid("split")} label="Profit split" suffix="%" value={value.profitSplitPct} onChange={(v) => set("profitSplitPct", v)} error={err("profitSplitPct")} max="100" />
      </fieldset>

      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Trading day boundary</legend>
        <NumField id={fid("reset")} label="Day reset hour (0–23)" value={value.dayResetHour} onChange={(v) => set("dayResetHour", v)} error={err("dayResetHour")} step="1" max="23" />
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={fid("tz")}>Reset timezone</Label>
          <Input
            id={fid("tz")}
            placeholder="e.g. Europe/Prague (blank = your timezone)"
            value={value.dayResetTimezone}
            onChange={(e) => set("dayResetTimezone", e.target.value)}
            aria-invalid={!!err("dayResetTimezone")?.length}
          />
          {err("dayResetTimezone")?.length ? <p className="text-xs text-destructive">{err("dayResetTimezone")![0]}</p> : null}
        </div>
      </fieldset>
    </div>
  );
}
