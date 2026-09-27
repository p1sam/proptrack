"use client";

import { useId } from "react";
import { AlertTriangle, CircleAlert, RotateCcw } from "lucide-react";
import type { ParsedTable } from "@/lib/import/csv";
import { FIELD_META, IMPORT_FIELDS, validateMapping, type ColumnMapping, type ImportField } from "@/lib/import/fields";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const NONE = "__none__";

function FieldSelect({ field, table, mapping, onChange, invalid }: { field: ImportField; table: ParsedTable; mapping: ColumnMapping; onChange: (f: ImportField, idx: number | null) => void; invalid: boolean }) {
  const id = useId();
  const meta = FIELD_META[field];
  const current = mapping[field];
  const sample = (i: number) => table.rows.find((r) => (r[i] ?? "").trim())?.[i]?.trim();
  const usedBy = (i: number) => IMPORT_FIELDS.find((f) => f !== field && mapping[f] === i);
  return (
    <div className="flex flex-col gap-1">
      <Label id={id}>
        {meta.label}
        {meta.required && (
          <span className="text-loss" aria-label="required">
            *
          </span>
        )}
      </Label>
      <Select value={current === null ? NONE : String(current)} onValueChange={(v) => onChange(field, v === NONE ? null : Number(v))}>
        <SelectTrigger aria-labelledby={id} aria-describedby={`${id}-d`} aria-invalid={invalid} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>— Not in file —</SelectItem>
          {table.headers.map((h, i) => {
            const s = sample(i);
            const other = usedBy(i);
            return (
              <SelectItem key={i} value={String(i)}>
                {h}
                <span className="text-muted-foreground">
                  {s ? ` · e.g. ${s.slice(0, 24)}` : ""}
                  {other ? ` · used by ${FIELD_META[other].label}` : ""}
                </span>
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
      <p id={`${id}-d`} className="text-[11px] text-muted-foreground">
        {meta.description}
      </p>
    </div>
  );
}

const GROUPS: { title: string; fields: ImportField[] }[] = [
  { title: "Trade", fields: ["symbol", "direction", "quantity", "externalId"] },
  { title: "Entry", fields: ["openedAt", "openTime", "entryPrice", "stopLoss", "takeProfit"] },
  { title: "Exit", fields: ["closedAt", "closeTime", "exitPrice"] },
  { title: "Money", fields: ["profit", "commission", "swap"] },
];

export function MappingStep({
  table,
  mapping,
  onChange,
  onReset,
  profitIsNet,
  onProfitIsNetChange,
}: {
  table: ParsedTable;
  mapping: ColumnMapping;
  onChange: (field: ImportField, idx: number | null) => void;
  onReset: () => void;
  profitIsNet: boolean;
  onProfitIsNetChange: (v: boolean) => void;
}) {
  const { errors, warnings } = validateMapping(mapping);
  const invalidFields = new Set(errors.map((e) => e.field));
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">Match each field to a column of your file. Fields marked * are required.</p>
        <Button type="button" variant="ghost" size="sm" onClick={onReset}>
          <RotateCcw /> Reset to detected
        </Button>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {GROUPS.map((g) => (
          <fieldset key={g.title} className="rounded-md border p-3">
            <legend className="px-1 text-xs font-semibold text-muted-foreground uppercase">{g.title}</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {g.fields.map((f) => (
                <FieldSelect key={f} field={f} table={table} mapping={mapping} onChange={onChange} invalid={invalidFields.has(f)} />
              ))}
            </div>
          </fieldset>
        ))}
      </div>

      <fieldset className="rounded-md border p-3" disabled={mapping.profit === null}>
        <legend className="px-1 text-xs font-semibold text-muted-foreground uppercase">Profit column</legend>
        <div className="flex flex-col gap-2 text-sm sm:flex-row sm:gap-6">
          <label className="flex items-start gap-2">
            <input type="radio" name="profit-kind" checked={!profitIsNet} onChange={() => onProfitIsNetChange(false)} className="mt-1 accent-primary" />
            <span>
              <span className="font-medium">Gross</span> — before commission and swap (MetaTrader, most platforms)
              <span className="block text-xs text-muted-foreground">Net P&amp;L = profit − commission + swap</span>
            </span>
          </label>
          <label className="flex items-start gap-2">
            <input type="radio" name="profit-kind" checked={profitIsNet} onChange={() => onProfitIsNetChange(true)} className="mt-1 accent-primary" />
            <span>
              <span className="font-medium">Net</span> — already includes commission and swap
              <span className="block text-xs text-muted-foreground">Net P&amp;L = profit, exactly as in the file</span>
            </span>
          </label>
        </div>
        {mapping.profit === null && <p className="mt-2 text-xs text-muted-foreground">No profit column mapped.</p>}
      </fieldset>

      {(errors.length > 0 || warnings.length > 0) && (
        <ul className="flex flex-col gap-1.5 text-sm" aria-live="polite">
          {errors.map((e) => (
            <li key={e.message} className="flex gap-2 text-loss">
              <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden /> {e.message}
            </li>
          ))}
          {warnings.map((w) => (
            <li key={w.message} className="flex gap-2 text-warning">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden /> {w.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
