"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { calculateExcursionR, computeTrade } from "@/lib/calc/trade";
import { fromZonedLocalInput, toZonedLocalInput } from "@/lib/datetime-local";
import { formatMoney, formatNumber, formatPct, formatR, formatRatio } from "@/lib/format";
import { tradeSchema, tradeWarnings } from "@/lib/validation/trade";
import { createTrade, updateTrade } from "@/server/actions/trades";
import type { TradeFormOptions } from "@/server/queries/trades";
import { Pnl, RValue } from "@/components/app/pnl";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { EmotionRatings, JournalTextSections } from "./journal-fields";
import { emptyJournal, journalHasContent, journalToInput, type JournalValues } from "./journal-values";
import { GRADES, GRADE_LABEL } from "./labels";
import { TagPicker } from "./tag-picker";

interface ExitRow {
  key: string;
  price: string;
  quantity: string;
  exitedAt: string;
}
interface CopyRow {
  enabled: boolean;
  quantity: string;
  commission: string;
}

export interface TradeFormValues {
  accountId: string;
  symbol: string;
  pointValue: string;
  direction: "LONG" | "SHORT";
  openedAt: string;
  entryPrice: string;
  stopLoss: string;
  takeProfit: string;
  quantity: string;
  exits: ExitRow[];
  commission: string;
  swap: string;
  reportedGrossPnl: string;
  riskAmountOverride: string;
  mfePrice: string;
  maePrice: string;
  strategyId: string;
  setup: string;
  timeframe: string;
  tradeType: string;
  entryModel: string;
  confluences: string[];
  marketCondition: string;
  grade: string;
  tagIds: string[];
  notes: string;
  journal: JournalValues;
}

/** Initial data for editing, serialisable from the server (dates as ISO strings). */
export interface TradeFormInitial {
  accountId: string;
  symbol: string;
  pointValue: number;
  direction: "LONG" | "SHORT";
  openedAt: string;
  entryPrice: number;
  stopLoss: number | null;
  takeProfit: number | null;
  quantity: number;
  exits: { price: number; quantity: number; exitedAt: string }[];
  commission: number;
  swap: number;
  reportedGrossPnl: number | null;
  riskAmountOverride: number | null;
  mfePrice: number | null;
  maePrice: number | null;
  strategyId: string | null;
  setup: string | null;
  timeframe: string | null;
  tradeType: string | null;
  entryModel: string | null;
  confluences: string[];
  marketCondition: string | null;
  grade: string | null;
  tagIds: string[];
  notes: string | null;
  journal: JournalValues;
}

const NONE = "__none__";
let keySeq = 0;
const newKey = () => `exit-${++keySeq}`;
const s = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(n));

function toNum(v: string): number | null {
  const t = v.trim().replace(/,/g, "");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function initialValues(opts: TradeFormOptions, init: TradeFormInitial | undefined, defaultAccountId: string | undefined): TradeFormValues {
  const tz = opts.timezone;
  if (init) {
    return {
      accountId: init.accountId,
      symbol: init.symbol,
      pointValue: s(init.pointValue),
      direction: init.direction,
      openedAt: toZonedLocalInput(init.openedAt, tz),
      entryPrice: s(init.entryPrice),
      stopLoss: s(init.stopLoss),
      takeProfit: s(init.takeProfit),
      quantity: s(init.quantity),
      exits: init.exits.length
        ? init.exits.map((e) => ({ key: newKey(), price: s(e.price), quantity: s(e.quantity), exitedAt: toZonedLocalInput(e.exitedAt, tz) }))
        : [{ key: newKey(), price: "", quantity: "", exitedAt: "" }],
      commission: s(init.commission || null),
      swap: s(init.swap || null),
      reportedGrossPnl: s(init.reportedGrossPnl),
      riskAmountOverride: s(init.riskAmountOverride),
      mfePrice: s(init.mfePrice),
      maePrice: s(init.maePrice),
      strategyId: init.strategyId ?? NONE,
      setup: init.setup ?? "",
      timeframe: init.timeframe ?? "",
      tradeType: init.tradeType ?? "",
      entryModel: init.entryModel ?? "",
      confluences: init.confluences,
      marketCondition: init.marketCondition ?? "",
      grade: init.grade ?? "",
      tagIds: init.tagIds,
      notes: init.notes ?? "",
      journal: init.journal,
    };
  }
  return {
    accountId: defaultAccountId ?? opts.accounts[0]?.id ?? "",
    symbol: "",
    pointValue: "",
    direction: "LONG",
    openedAt: toZonedLocalInput(new Date(), tz),
    entryPrice: "",
    stopLoss: "",
    takeProfit: "",
    quantity: "",
    exits: [{ key: newKey(), price: "", quantity: "", exitedAt: "" }],
    commission: "",
    swap: "",
    reportedGrossPnl: "",
    riskAmountOverride: "",
    mfePrice: "",
    maePrice: "",
    strategyId: NONE,
    setup: "",
    timeframe: "",
    tradeType: "",
    entryModel: "",
    confluences: [],
    marketCondition: "",
    grade: "",
    tagIds: opts.tags.filter((t) => t.isDefault).map((t) => t.id),
    notes: "",
    journal: emptyJournal(),
  };
}

const isBlankExit = (e: ExitRow) => !e.price.trim() && !e.quantity.trim();

/** Non-blank exit rows with a blank quantity resolved to the remaining position (only one may be blank). */
function resolveExits(rows: ExitRow[], quantity: number | null) {
  const used = rows.filter((r) => !isBlankExit(r));
  const blanks = used.filter((r) => !r.quantity.trim());
  const explicit = used.reduce((a, r) => a + (toNum(r.quantity) ?? 0), 0);
  const remaining = quantity !== null ? Math.max(0, Math.round((quantity - explicit) * 1e6) / 1e6) : null;
  return used.map((r) => ({
    row: r,
    price: toNum(r.price),
    quantity: r.quantity.trim() ? toNum(r.quantity) : blanks.length === 1 ? remaining : null,
  }));
}

function FieldError({ id, errors }: { id: string; errors?: string[] }) {
  if (!errors?.length) return null;
  return (
    <p id={id} className="text-xs text-destructive">
      {errors[0]}
    </p>
  );
}

function FormSection({ title, description, children, className }: { title: string; description?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-lg border bg-card", className)} aria-labelledby={`sec-${title.replace(/\W+/g, "-")}`}>
      <div className="border-b px-4 py-3">
        <h2 id={`sec-${title.replace(/\W+/g, "-")}`} className="text-sm font-semibold">
          {title}
        </h2>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function SuggestInput({ id, label, value, onChange, suggestions, maxLength, placeholder, error }: { id: string; label: string; value: string; onChange: (v: string) => void; suggestions: string[]; maxLength: number; placeholder?: string; error?: string[] }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} list={suggestions.length ? `${id}-list` : undefined} value={value} onChange={(e) => onChange(e.target.value)} maxLength={maxLength} placeholder={placeholder} autoComplete="off" aria-invalid={!!error?.length} aria-describedby={error?.length ? `${id}-err` : undefined} />
      {suggestions.length > 0 && (
        <datalist id={`${id}-list`}>
          {suggestions.map((o) => (
            <option key={o} value={o} />
          ))}
        </datalist>
      )}
      <FieldError id={`${id}-err`} errors={error} />
    </div>
  );
}

export function TradeForm({ options, mode, tradeId, initial, defaultAccountId, linkedCopies = 0 }: { options: TradeFormOptions; mode: "create" | "edit"; tradeId?: string; initial?: TradeFormInitial; defaultAccountId?: string; linkedCopies?: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [v, setV] = useState<TradeFormValues>(() => initialValues(options, initial, defaultAccountId));
  const [pointValueTouched, setPointValueTouched] = useState(mode === "edit");
  const [copies, setCopies] = useState<Record<string, CopyRow>>({});
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [confluenceDraft, setConfluenceDraft] = useState("");

  const tz = options.timezone;
  const allAccounts = useMemo(() => [...options.accounts, ...options.archivedAccounts], [options]);
  const account = allAccounts.find((a) => a.id === v.accountId);
  const ccy = account?.currency ?? "USD";
  const instrument = options.instruments.find((i) => i.symbol.toUpperCase() === v.symbol.trim().toUpperCase());

  const set = <K extends keyof TradeFormValues>(k: K, value: TradeFormValues[K]) => setV((p) => ({ ...p, [k]: value }));
  const err = (k: string) => errors[k];
  const inputProps = (k: string) => ({ "aria-invalid": !!errors[k]?.length, "aria-describedby": errors[k]?.length ? `f-${k.replace(/\./g, "-")}-err` : undefined });

  // ── Live computation ────────────────────────────────────────────────────
  const entry = toNum(v.entryPrice);
  const qty = toNum(v.quantity);
  const stop = toNum(v.stopLoss);
  const target = toNum(v.takeProfit);
  const pv = toNum(v.pointValue) ?? instrument?.pointValue ?? 1;
  const resolved = resolveExits(v.exits, qty);
  const validExits = resolved.filter((e): e is typeof e & { price: number; quantity: number } => e.price !== null && e.price > 0 && e.quantity !== null && e.quantity > 0);
  const computed =
    entry !== null && entry > 0 && qty !== null && qty > 0
      ? computeTrade({
          direction: v.direction,
          entryPrice: entry,
          quantity: qty,
          pointValue: pv,
          exits: validExits.map((e) => ({ price: e.price, quantity: e.quantity })),
          stopLoss: stop,
          takeProfit: target,
          commission: toNum(v.commission) ?? 0,
          swap: toNum(v.swap) ?? 0,
          reportedGrossPnl: toNum(v.reportedGrossPnl),
          riskAmountOverride: toNum(v.riskAmountOverride),
          balanceBefore: account?.balance ?? null,
        })
      : null;
  const exitQty = validExits.reduce((a, e) => a + e.quantity, 0);
  const excursion = (price: number | null, kind: "MFE" | "MAE") => (entry ? calculateExcursionR({ direction: v.direction, entryPrice: entry, stopLoss: stop, price, kind }) : null);
  const mfeR = excursion(toNum(v.mfePrice), "MFE");
  const maeR = excursion(toNum(v.maePrice), "MAE");
  const warnings = entry ? tradeWarnings({ direction: v.direction, entryPrice: entry, stopLoss: stop, takeProfit: target }) : [];

  // ── Exits ───────────────────────────────────────────────────────────────
  const updateExit = (key: string, patch: Partial<ExitRow>) =>
    setV((p) => ({
      ...p,
      exits: p.exits.map((e) => {
        if (e.key !== key) return e;
        const next = { ...e, ...patch };
        // Default the exit time to the entry time once a price is typed.
        if (patch.price !== undefined && patch.price && !e.exitedAt) next.exitedAt = p.openedAt;
        return next;
      }),
    }));
  const addExit = () => setV((p) => ({ ...p, exits: [...p.exits, { key: newKey(), price: "", quantity: "", exitedAt: p.exits.at(-1)?.exitedAt || p.openedAt }] }));
  const removeExit = (key: string) => setV((p) => ({ ...p, exits: p.exits.length > 1 ? p.exits.filter((e) => e.key !== key) : [{ key: newKey(), price: "", quantity: "", exitedAt: "" }] }));

  // ── Submit ──────────────────────────────────────────────────────────────
  function buildPayload() {
    const localErrors: Record<string, string[]> = {};
    const openedAt = fromZonedLocalInput(v.openedAt, tz);
    if (!openedAt) localErrors.openedAt = ["Enter a valid entry date and time"];
    const exits = resolved.map((e, i) => {
      const at = fromZonedLocalInput(e.row.exitedAt, tz);
      if (!at) localErrors[`exits.${i}.exitedAt`] = ["Enter the exit date and time"];
      if (e.quantity === null && !e.row.quantity.trim()) localErrors[`exits.${i}.quantity`] = ["Enter the quantity (only one exit may use the remaining size)"];
      return { price: e.row.price, quantity: e.quantity ?? e.row.quantity, exitedAt: at?.toISOString() ?? "" };
    });
    const journalFilled = journalHasContent(v.journal);
    const payload = {
      accountId: v.accountId,
      symbol: v.symbol,
      pointValue: v.pointValue,
      direction: v.direction,
      openedAt: openedAt?.toISOString() ?? "",
      entryPrice: v.entryPrice,
      stopLoss: v.stopLoss,
      takeProfit: v.takeProfit,
      quantity: v.quantity,
      exits,
      commission: v.commission,
      swap: v.swap,
      reportedGrossPnl: v.reportedGrossPnl,
      riskAmountOverride: v.riskAmountOverride,
      mfePrice: v.mfePrice,
      maePrice: v.maePrice,
      strategyId: v.strategyId === NONE ? null : v.strategyId,
      setup: v.setup,
      timeframe: v.timeframe,
      tradeType: v.tradeType,
      entryModel: v.entryModel,
      confluences: v.confluences,
      marketCondition: v.marketCondition,
      grade: (v.grade || null) as (typeof GRADES)[number] | null,
      tagIds: v.tagIds,
      notes: v.notes,
      journal: mode === "edit" || journalFilled ? journalToInput(v.journal) : undefined,
      copies:
        mode === "create"
          ? Object.entries(copies)
              .filter(([id, c]) => c.enabled && id !== v.accountId)
              .map(([accountId, c]) => ({ accountId, quantity: c.quantity, commission: c.commission, swap: "", reportedGrossPnl: "" }))
          : [],
    };
    return { payload, localErrors };
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const { payload, localErrors } = buildPayload();
    const parsed = tradeSchema.safeParse(payload);
    const fieldErrors: Record<string, string[]> = { ...localErrors };
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const key = issue.path.join(".") || "_";
        if (!fieldErrors[key]) fieldErrors[key] = [issue.message];
      }
    }
    setErrors(fieldErrors);
    if (Object.keys(fieldErrors).length) {
      setFormError("Please fix the highlighted fields.");
      requestAnimationFrame(() => document.querySelector<HTMLElement>("[aria-invalid=true]")?.focus());
      return;
    }
    start(async () => {
      const res = mode === "edit" && tradeId ? await updateTrade({ ...payload, id: tradeId }) : await createTrade(payload);
      if (!res.ok) {
        setErrors(res.fieldErrors ?? {});
        setFormError(res.error);
        toast.error(res.error);
        return;
      }
      const data = res.data as { id: string; ids?: string[] };
      toast.success(mode === "edit" ? "Trade updated" : data.ids && data.ids.length > 1 ? `Trade saved on ${data.ids.length} accounts` : "Trade saved");
      router.push(`/trades/${data.id}`);
      router.refresh();
    });
  }

  const copyAccounts = options.accounts.filter((a) => a.id !== v.accountId);
  const confluenceSuggestions = options.categories.confluences.filter((c) => !v.confluences.includes(c));
  const addConfluence = (name: string) => {
    const n = name.trim();
    if (!n || v.confluences.includes(n) || v.confluences.length >= 20) return;
    set("confluences", [...v.confluences, n.slice(0, 60)]);
  };

  const accountOptions = mode === "edit" ? allAccounts : options.accounts;

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="grid min-w-0 gap-5">
        {formError && (
          <Alert variant="destructive" role="alert">
            <AlertTriangle />
            <AlertTitle>Trade not saved</AlertTitle>
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        )}

        <FormSection title="Trade" description={`Times are in your timezone (${tz}).`}>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="f-accountId">Account</Label>
              <Select value={v.accountId} onValueChange={(x) => set("accountId", x)}>
                <SelectTrigger id="f-accountId" className="w-full" {...inputProps("accountId")}>
                  <SelectValue placeholder="Choose an account" />
                </SelectTrigger>
                <SelectContent>
                  {accountOptions.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                      {a.firm ? ` · ${a.firm}` : ""} · {a.currency}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {account && <p className="text-xs text-muted-foreground tabular">Balance {formatMoney(account.balance, account.currency)}</p>}
              <FieldError id="f-accountId-err" errors={err("accountId")} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="f-symbol">Instrument</Label>
              <Input
                id="f-symbol"
                list="f-symbol-list"
                value={v.symbol}
                autoComplete="off"
                maxLength={32}
                placeholder="e.g. EURUSD, NQ"
                onChange={(e) => {
                  const sym = e.target.value;
                  const inst = options.instruments.find((i) => i.symbol.toUpperCase() === sym.trim().toUpperCase());
                  setV((p) => ({ ...p, symbol: sym, ...(!pointValueTouched ? { pointValue: inst ? String(inst.pointValue) : "" } : {}) }));
                }}
                {...inputProps("symbol")}
              />
              <datalist id="f-symbol-list">
                {options.instruments.map((i) => (
                  <option key={i.symbol} value={i.symbol}>
                    {i.name ?? ""}
                  </option>
                ))}
              </datalist>
              <FieldError id="f-symbol-err" errors={err("symbol")} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="f-pointValue">Point value</Label>
              <Input
                id="f-pointValue"
                inputMode="decimal"
                value={v.pointValue}
                placeholder={instrument ? String(instrument.pointValue) : "1"}
                onChange={(e) => {
                  setPointValueTouched(true);
                  set("pointValue", e.target.value);
                }}
                {...inputProps("pointValue")}
                aria-describedby="f-pointValue-help"
              />
              <p id="f-pointValue-help" className="text-xs text-muted-foreground">
                {ccy} per 1.0 price move per unit{instrument ? "" : v.symbol.trim() ? " · new instrument" : ""}
              </p>
              <FieldError id="f-pointValue-err" errors={err("pointValue")} />
            </div>

            <fieldset className="grid gap-1.5">
              <legend className="mb-1.5 text-sm font-medium">Direction</legend>
              <div className="grid grid-cols-2 gap-1.5">
                {(["LONG", "SHORT"] as const).map((d) => (
                  <label
                    key={d}
                    htmlFor={`f-dir-${d}`}
                    className={cn(
                      "flex h-8 cursor-pointer items-center justify-center rounded-lg border text-sm font-medium transition-colors has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
                      v.direction === d ? (d === "LONG" ? "border-profit/50 bg-profit/15 text-profit" : "border-loss/50 bg-loss/15 text-loss") : "hover:bg-muted",
                    )}
                  >
                    <input id={`f-dir-${d}`} type="radio" name="direction" className="sr-only" checked={v.direction === d} onChange={() => set("direction", d)} />
                    {d === "LONG" ? "Long" : "Short"}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="grid gap-1.5 sm:col-span-1 xl:col-span-1">
              <Label htmlFor="f-openedAt">Entry time</Label>
              <Input id="f-openedAt" type="datetime-local" value={v.openedAt} onChange={(e) => set("openedAt", e.target.value)} {...inputProps("openedAt")} />
              <FieldError id="f-openedAt-err" errors={err("openedAt")} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="f-quantity">Quantity</Label>
              <Input id="f-quantity" inputMode="decimal" value={v.quantity} onChange={(e) => set("quantity", e.target.value)} placeholder="Lots / contracts / units" {...inputProps("quantity")} />
              <FieldError id="f-quantity-err" errors={err("quantity")} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="f-entryPrice">Entry price</Label>
              <Input id="f-entryPrice" inputMode="decimal" value={v.entryPrice} onChange={(e) => set("entryPrice", e.target.value)} {...inputProps("entryPrice")} />
              <FieldError id="f-entryPrice-err" errors={err("entryPrice")} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="f-stopLoss">Stop loss</Label>
              <Input id="f-stopLoss" inputMode="decimal" value={v.stopLoss} onChange={(e) => set("stopLoss", e.target.value)} placeholder="Optional" {...inputProps("stopLoss")} />
              <FieldError id="f-stopLoss-err" errors={err("stopLoss")} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="f-takeProfit">Take profit</Label>
              <Input id="f-takeProfit" inputMode="decimal" value={v.takeProfit} onChange={(e) => set("takeProfit", e.target.value)} placeholder="Optional" {...inputProps("takeProfit")} />
              <FieldError id="f-takeProfit-err" errors={err("takeProfit")} />
            </div>
          </div>
          {warnings.length > 0 && (
            <ul className="mt-3 grid gap-1 text-xs text-warning" aria-live="polite">
              {warnings.map((w) => (
                <li key={w} className="flex gap-1.5">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> {w}
                </li>
              ))}
            </ul>
          )}
        </FormSection>

        <FormSection title="Exits" description="Add one row per partial exit. Leave empty to keep the trade open; a blank quantity uses the remaining size.">
          <div className="grid gap-3">
            {v.exits.map((e, i) => {
              const r = resolved.find((x) => x.row.key === e.key);
              return (
                <div key={e.key} className="grid grid-cols-2 items-start gap-2 sm:grid-cols-[1fr_1fr_1.4fr_auto]">
                  <div className="grid gap-1">
                    <Label htmlFor={`f-exits-${i}-price`} className="text-xs">
                      Exit {i + 1} price
                    </Label>
                    <Input id={`f-exits-${i}-price`} inputMode="decimal" value={e.price} onChange={(x) => updateExit(e.key, { price: x.target.value })} {...inputProps(`exits.${i}.price`)} />
                    <FieldError id={`f-exits-${i}-price-err`} errors={err(`exits.${i}.price`)} />
                  </div>
                  <div className="grid gap-1">
                    <Label htmlFor={`f-exits-${i}-quantity`} className="text-xs">
                      Quantity
                    </Label>
                    <Input id={`f-exits-${i}-quantity`} inputMode="decimal" value={e.quantity} placeholder={r && !e.quantity && r.quantity !== null ? `${formatNumber(r.quantity, 6)} (rest)` : ""} onChange={(x) => updateExit(e.key, { quantity: x.target.value })} {...inputProps(`exits.${i}.quantity`)} />
                    <FieldError id={`f-exits-${i}-quantity-err`} errors={err(`exits.${i}.quantity`)} />
                  </div>
                  <div className="col-span-2 grid gap-1 sm:col-span-1">
                    <Label htmlFor={`f-exits-${i}-exitedAt`} className="text-xs">
                      Exit time
                    </Label>
                    <Input id={`f-exits-${i}-exitedAt`} type="datetime-local" value={e.exitedAt} onChange={(x) => updateExit(e.key, { exitedAt: x.target.value })} {...inputProps(`exits.${i}.exitedAt`)} />
                    <FieldError id={`f-exits-${i}-exitedAt-err`} errors={err(`exits.${i}.exitedAt`)} />
                  </div>
                  <Button type="button" variant="ghost" size="icon" className="mt-5" onClick={() => removeExit(e.key)} aria-label={`Remove exit ${i + 1}`}>
                    <Trash2 />
                  </Button>
                </div>
              );
            })}
            <FieldError id="f-exits-err" errors={err("exits")} />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button type="button" variant="outline" size="sm" onClick={addExit} disabled={v.exits.length >= 20}>
                <Plus /> Add partial exit
              </Button>
              {qty !== null && qty > 0 && (
                <span className={cn("text-xs tabular", exitQty > qty + 1e-9 ? "text-destructive" : "text-muted-foreground")}>
                  Exited {formatNumber(exitQty, 6)} of {formatNumber(qty, 6)}
                  {exitQty > 0 && exitQty < qty ? " · trade stays open" : exitQty === 0 ? " · open trade" : ""}
                </span>
              )}
            </div>
          </div>
        </FormSection>

        <FormSection title="Costs & overrides" description="Commission is a positive cost; swap is signed (negative = cost).">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {(
              [
                ["commission", "Commission", "0"],
                ["swap", "Swap / financing", "0"],
                ["reportedGrossPnl", "Platform gross P&L", "Optional — overrides price calc"],
                ["riskAmountOverride", `Risk override (${ccy})`, "Optional — overrides stop risk"],
                ["mfePrice", "MFE price (best reached)", "Optional"],
                ["maePrice", "MAE price (worst reached)", "Optional"],
              ] as const
            ).map(([k, label, ph]) => (
              <div key={k} className="grid gap-1.5">
                <Label htmlFor={`f-${k}`}>{label}</Label>
                <Input id={`f-${k}`} inputMode="decimal" value={v[k]} placeholder={ph} onChange={(e) => set(k, e.target.value)} {...inputProps(k)} />
                <FieldError id={`f-${k}-err`} errors={err(k)} />
              </div>
            ))}
          </div>
        </FormSection>

        <FormSection title="Classification">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <div className="grid gap-1.5">
              <Label htmlFor="f-strategyId">Strategy</Label>
              <Select value={v.strategyId} onValueChange={(x) => set("strategyId", x)}>
                <SelectTrigger id="f-strategyId" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>No strategy</SelectItem>
                  {options.strategies.map((st) => (
                    <SelectItem key={st.id} value={st.id}>
                      {st.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError id="f-strategyId-err" errors={err("strategyId")} />
            </div>
            <SuggestInput id="f-setup" label="Setup" value={v.setup} onChange={(x) => set("setup", x)} suggestions={options.categories.setups} maxLength={80} error={err("setup")} />
            <SuggestInput id="f-timeframe" label="Timeframe" value={v.timeframe} onChange={(x) => set("timeframe", x)} suggestions={options.categories.timeframes} maxLength={20} placeholder="e.g. 5m, 1H" error={err("timeframe")} />
            <SuggestInput id="f-tradeType" label="Trade type" value={v.tradeType} onChange={(x) => set("tradeType", x)} suggestions={options.categories.tradeTypes} maxLength={40} placeholder="e.g. Scalp, Swing" error={err("tradeType")} />
            <SuggestInput id="f-entryModel" label="Entry model" value={v.entryModel} onChange={(x) => set("entryModel", x)} suggestions={options.categories.entryModels} maxLength={80} error={err("entryModel")} />
            <SuggestInput id="f-marketCondition" label="Market condition" value={v.marketCondition} onChange={(x) => set("marketCondition", x)} suggestions={options.categories.marketConditions} maxLength={60} placeholder="e.g. Trending, Ranging" error={err("marketCondition")} />
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <fieldset className="grid gap-1.5">
              <legend className="mb-1.5 text-sm font-medium">Grade</legend>
              <div className="flex flex-wrap gap-1.5">
                {["", ...GRADES].map((g) => (
                  <label
                    key={g || "none"}
                    htmlFor={`f-grade-${g || "none"}`}
                    className={cn(
                      "flex h-8 min-w-10 cursor-pointer items-center justify-center rounded-md border px-2 text-sm transition-colors has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
                      v.grade === g ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted",
                    )}
                  >
                    <input id={`f-grade-${g || "none"}`} type="radio" name="grade" className="sr-only" checked={v.grade === g} onChange={() => set("grade", g)} />
                    {g ? GRADE_LABEL[g as (typeof GRADES)[number]] : "None"}
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="grid content-start gap-1.5">
              <Label htmlFor="f-confluence-add">Confluences</Label>
              {v.confluences.length > 0 && (
                <ul className="flex flex-wrap gap-1.5" aria-label="Selected confluences">
                  {v.confluences.map((c) => (
                    <li key={c} className="inline-flex items-center gap-1 rounded-md border border-primary/40 bg-primary/10 py-0.5 pr-0.5 pl-2 text-xs">
                      {c}
                      <button type="button" className="rounded p-0.5 hover:bg-primary/20" aria-label={`Remove ${c}`} onClick={() => set("confluences", v.confluences.filter((x) => x !== c))}>
                        <X className="size-3" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex gap-2">
                <Input
                  id="f-confluence-add"
                  list="f-confluence-list"
                  value={confluenceDraft}
                  maxLength={60}
                  placeholder="Type and press Enter"
                  autoComplete="off"
                  onChange={(e) => setConfluenceDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addConfluence(confluenceDraft);
                      setConfluenceDraft("");
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    addConfluence(confluenceDraft);
                    setConfluenceDraft("");
                  }}
                  disabled={!confluenceDraft.trim()}
                >
                  Add
                </Button>
              </div>
              <datalist id="f-confluence-list">
                {confluenceSuggestions.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
              {confluenceSuggestions.length > 0 && (
                <div className="flex flex-wrap gap-1" aria-label="Suggested confluences">
                  {confluenceSuggestions.slice(0, 12).map((c) => (
                    <button key={c} type="button" onClick={() => addConfluence(c)} className="rounded-md border border-dashed px-2 py-0.5 text-xs text-muted-foreground hover:border-solid hover:text-foreground">
                      + {c}
                    </button>
                  ))}
                </div>
              )}
              <FieldError id="f-confluences-err" errors={err("confluences")} />
            </div>
          </div>
        </FormSection>

        <FormSection title="Tags" description={mode === "create" ? "Default tags are preselected." : undefined}>
          <TagPicker tags={options.tags} value={v.tagIds} onChange={(ids) => set("tagIds", ids)} />
          <FieldError id="f-tagIds-err" errors={err("tagIds")} />
        </FormSection>

        {mode === "create" ? (
          copyAccounts.length > 0 && (
            <FormSection title="Also taken on" description="Record the same trade on other accounts. Copies are linked so trade statistics count the idea once; exits scale with each copy's quantity.">
              <ul className="grid gap-2">
                {copyAccounts.map((a) => {
                  const c = copies[a.id] ?? { enabled: false, quantity: "", commission: "" };
                  const patch = (p: Partial<CopyRow>) => setCopies((prev) => ({ ...prev, [a.id]: { ...c, ...p } }));
                  return (
                    <li key={a.id} className={cn("grid items-center gap-2 rounded-md border px-3 py-2 sm:grid-cols-[1fr_140px_140px]", c.enabled && "border-primary/40 bg-primary/5")}>
                      <div className="flex items-center gap-2">
                        <Checkbox id={`f-copy-${a.id}`} checked={c.enabled} onCheckedChange={(x) => patch({ enabled: x === true })} />
                        <Label htmlFor={`f-copy-${a.id}`} className="font-normal">
                          {a.name}
                          <span className="text-xs text-muted-foreground">
                            {a.firm ? ` · ${a.firm}` : ""} · {formatMoney(a.balance, a.currency)}
                          </span>
                        </Label>
                      </div>
                      {c.enabled && (
                        <>
                          <div className="grid gap-1">
                            <Label htmlFor={`f-copy-${a.id}-qty`} className="text-xs">
                              Quantity
                            </Label>
                            <Input id={`f-copy-${a.id}-qty`} inputMode="decimal" value={c.quantity} placeholder={v.quantity || "Same"} onChange={(e) => patch({ quantity: e.target.value })} className="h-7" />
                          </div>
                          <div className="grid gap-1">
                            <Label htmlFor={`f-copy-${a.id}-comm`} className="text-xs">
                              Commission
                            </Label>
                            <Input id={`f-copy-${a.id}-comm`} inputMode="decimal" value={c.commission} placeholder={v.commission || "Same"} onChange={(e) => patch({ commission: e.target.value })} className="h-7" />
                          </div>
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
              <FieldError id="f-copies-err" errors={err("copies")} />
            </FormSection>
          )
        ) : (
          linkedCopies > 0 && <p className="text-xs text-muted-foreground">This trade is linked to {linkedCopies} copy trade{linkedCopies === 1 ? "" : "s"} on other accounts. Edits apply to this account only.</p>
        )}

        <FormSection title="Journal" description="Optional — you can also fill this in later from the trade page.">
          <JournalTextSections value={v.journal} onChange={(p) => set("journal", { ...v.journal, ...p })} idPrefix="f-j" />
        </FormSection>

        <FormSection title="Psychology" description="Rate each from 1 (very low) to 5 (very high). Leave unrated if it did not apply.">
          <EmotionRatings values={v.journal} onChange={(emo, val) => set("journal", { ...v.journal, [emo]: val })} idPrefix="f-emo" />
        </FormSection>

        <FormSection title="Notes">
          <Label htmlFor="f-notes" className="sr-only">
            Notes
          </Label>
          <Textarea id="f-notes" rows={4} maxLength={10000} value={v.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Anything else worth remembering" />
        </FormSection>

        <div className="flex flex-wrap justify-end gap-2 lg:hidden">
          <Button type="button" variant="outline" asChild>
            <Link href={tradeId ? `/trades/${tradeId}` : "/trades"}>Cancel</Link>
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : mode === "edit" ? "Save changes" : "Save trade"}
          </Button>
        </div>
      </div>

      <aside className="lg:sticky lg:top-4 lg:self-start" aria-label="Computed values">
        <div className="rounded-lg border bg-card">
          <div className="border-b px-4 py-3">
            <h2 className="text-sm font-semibold">Live calculation</h2>
            <p className="text-xs text-muted-foreground">In {ccy}. Same formulas as the saved trade.</p>
          </div>
          <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 p-4 text-sm" aria-live="polite">
            <dt className="text-muted-foreground">Status</dt>
            <dd className="text-right">{computed ? (computed.closed ? "Closed" : "Open") : "—"}</dd>
            <dt className="text-muted-foreground">Avg exit</dt>
            <dd className="text-right tabular">{computed?.exitPrice != null ? formatNumber(computed.exitPrice, 8) : "—"}</dd>
            <dt className="text-muted-foreground">Gross P&amp;L</dt>
            <dd className="text-right">
              <Pnl value={computed?.grossPnl} currency={ccy} />
            </dd>
            <dt className="font-medium">Net P&amp;L</dt>
            <dd className="text-right font-semibold">
              <Pnl value={computed?.netPnl} currency={ccy} />
            </dd>
            <dt className="mt-2 text-muted-foreground">Risk</dt>
            <dd className="mt-2 text-right tabular">{computed?.initialRisk != null ? formatMoney(computed.initialRisk, ccy) : "—"}</dd>
            <dt className="text-muted-foreground">Risk % of balance</dt>
            <dd className="text-right tabular">{formatPct(computed?.riskPercent)}</dd>
            <dt className="text-muted-foreground">Stop distance</dt>
            <dd className="text-right tabular">{computed?.stopDistance != null ? formatNumber(computed.stopDistance, 8) : "—"}</dd>
            <dt className="text-muted-foreground">Planned R:R</dt>
            <dd className="text-right tabular">{computed?.plannedRR != null ? `1 : ${formatRatio(computed.plannedRR)}` : "—"}</dd>
            <dt className="text-muted-foreground">Actual R</dt>
            <dd className="text-right">
              <RValue value={computed?.rMultiple} />
            </dd>
            <dt className="text-muted-foreground">MFE</dt>
            <dd className="text-right tabular">{formatR(mfeR)}</dd>
            <dt className="text-muted-foreground">MAE</dt>
            <dd className="text-right tabular">{formatR(maeR)}</dd>
          </dl>
          <p className="border-t px-4 py-2 text-[11px] text-muted-foreground">
            Risk % uses the account&apos;s current closed balance{account ? ` (${formatMoney(account.balance, ccy)})` : ""}; the saved trade uses the balance at entry.
            {!toNum(v.pointValue) && !instrument && " Point value assumed 1."}
          </p>
          <div className="hidden gap-2 border-t p-4 lg:grid">
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : mode === "edit" ? "Save changes" : "Save trade"}
            </Button>
            <Button type="button" variant="outline" asChild>
              <Link href={tradeId ? `/trades/${tradeId}` : "/trades"}>Cancel</Link>
            </Button>
          </div>
        </div>
      </aside>
    </form>
  );
}
