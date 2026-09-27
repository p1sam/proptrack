"use client";

import { useId } from "react";
import { AlertTriangle, Info } from "lucide-react";
import { FILE_ADAPTERS } from "@/lib/import/adapters";
import { delimiterLabel, type ParsedTable } from "@/lib/import/csv";
import { DATE_FORMAT_LABELS, type DateFormat, type DateFormatDetection } from "@/lib/import/dates";
import { FIELD_META, IMPORT_FIELDS, type ColumnMapping, type ImportField } from "@/lib/import/fields";
import type { DecimalSeparator } from "@/lib/import/numbers";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatBytes } from "./upload-step";

export type DecimalChoice = DecimalSeparator | "auto";

export function fieldsByColumn(mapping: ColumnMapping): Map<number, ImportField[]> {
  const m = new Map<number, ImportField[]>();
  for (const f of IMPORT_FIELDS) {
    const idx = mapping[f];
    if (idx !== null) m.set(idx, [...(m.get(idx) ?? []), f]);
  }
  return m;
}

export function RawPreview({ table, mapping, rows = 5 }: { table: ParsedTable; mapping: ColumnMapping; rows?: number }) {
  const byCol = fieldsByColumn(mapping);
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-xs">
        <caption className="sr-only">First rows of the file with detected fields</caption>
        <thead className="bg-muted/40">
          <tr>
            {table.headers.map((h, i) => (
              <th key={i} scope="col" className="px-2 py-1.5 text-left align-bottom font-medium whitespace-nowrap">
                <div>{h}</div>
                <div className="mt-0.5 flex flex-wrap gap-1">
                  {(byCol.get(i) ?? []).map((f) => (
                    <Badge key={f} variant="secondary" className="text-[10px]">
                      {FIELD_META[f].label}
                    </Badge>
                  ))}
                  {!byCol.has(i) && <span className="text-[10px] font-normal text-muted-foreground">ignored</span>}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">
          {table.rows.slice(0, rows).map((r, ri) => (
            <tr key={ri}>
              {table.headers.map((_, ci) => (
                <td key={ci} className="px-2 py-1 whitespace-nowrap tabular text-muted-foreground">
                  {r[ci]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function DetectStep({
  file,
  table,
  mapping,
  adapterId,
  onAdapterChange,
  dateFormat,
  onDateFormatChange,
  dateDetection,
  decimalChoice,
  onDecimalChange,
  decimalDetected,
  timeZone,
}: {
  file: { name: string; size: number };
  table: ParsedTable;
  mapping: ColumnMapping;
  adapterId: string;
  onAdapterChange: (id: string) => void;
  dateFormat: DateFormat;
  onDateFormatChange: (f: DateFormat) => void;
  dateDetection: DateFormatDetection;
  decimalChoice: DecimalChoice;
  onDecimalChange: (d: DecimalChoice) => void;
  decimalDetected: DecimalSeparator | "ambiguous";
  timeZone: string;
}) {
  const formatId = useId();
  const dateId = useId();
  const decId = useId();
  const mapped = IMPORT_FIELDS.filter((f) => mapping[f] !== null).length;
  const needsDateChoice = dateDetection.ambiguous && dateFormat !== "dmy" && dateFormat !== "mdy";
  const adapter = FILE_ADAPTERS.find((a) => a.id === adapterId);

  return (
    <div className="flex flex-col gap-5">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-xs text-muted-foreground">File</dt>
          <dd className="truncate font-medium" title={file.name}>
            {file.name}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Size · delimiter</dt>
          <dd>
            {formatBytes(file.size)} · {delimiterLabel(table.delimiter)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Data rows</dt>
          <dd className="tabular">{table.rows.length.toLocaleString("en-US")}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Columns recognised</dt>
          <dd className="tabular">
            {mapped} of {table.headers.length}
          </dd>
        </div>
      </dl>
      {table.notes.length > 0 && (
        <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
          {table.notes.map((n) => (
            <li key={n} className="flex gap-1.5">
              <Info className="mt-0.5 size-3 shrink-0" aria-hidden /> {n}
            </li>
          ))}
        </ul>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <Label id={formatId}>File format</Label>
          <Select value={adapterId} onValueChange={onAdapterChange}>
            <SelectTrigger aria-labelledby={formatId} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FILE_ADAPTERS.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">{adapter?.description}</p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label id={dateId}>Date format</Label>
          <Select value={dateFormat} onValueChange={(v) => onDateFormatChange(v as DateFormat)}>
            <SelectTrigger aria-labelledby={dateId} className="w-full" aria-invalid={needsDateChoice}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(DATE_FORMAT_LABELS) as DateFormat[]).map((f) => (
                <SelectItem key={f} value={f}>
                  {f === "auto" ? `${DATE_FORMAT_LABELS.auto} (${dateDetection.ambiguous ? "ambiguous" : DATE_FORMAT_LABELS[dateDetection.format].split(" — ")[0].toLowerCase()})` : DATE_FORMAT_LABELS[f]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">Times are read as {timeZone} unless they carry an offset.</p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label id={decId}>Decimal separator</Label>
          <Select value={decimalChoice} onValueChange={(v) => onDecimalChange(v as DecimalChoice)}>
            <SelectTrigger aria-labelledby={decId} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Detect ({decimalDetected === "ambiguous" ? "unclear — using dot" : decimalDetected === "." ? "dot: 1,234.56" : "comma: 1.234,56"})</SelectItem>
              <SelectItem value=".">Dot — 1,234.56</SelectItem>
              <SelectItem value=",">Comma — 1.234,56</SelectItem>
            </SelectContent>
          </Select>
          {decimalDetected === "ambiguous" && decimalChoice === "auto" && <p className="text-xs text-warning">Values like “1,234” fit both conventions — please choose.</p>}
        </div>
      </div>

      {dateDetection.ambiguous && (
        <Alert>
          {needsDateChoice ? <AlertTriangle className="text-warning" /> : <Info />}
          <AlertTitle>{needsDateChoice ? "Day-first or month-first?" : "Date order"}</AlertTitle>
          <AlertDescription>
            <p>Every date in the file (e.g. “{table.rows.find((r) => mapping.openedAt !== null && r[mapping.openedAt])?.[mapping.openedAt ?? 0]}”) could be read either way.</p>
            <div className="mt-2 flex flex-wrap gap-4" role="radiogroup" aria-label="Date order">
              {(["dmy", "mdy"] as const).map((f) => (
                <label key={f} className="flex items-center gap-2 text-sm text-foreground">
                  <input type="radio" name="date-order" value={f} checked={dateFormat === f} onChange={() => onDateFormatChange(f)} className="accent-primary" />
                  {DATE_FORMAT_LABELS[f]}
                </label>
              ))}
            </div>
          </AlertDescription>
        </Alert>
      )}

      <div>
        <h3 className="mb-2 text-sm font-medium">First rows</h3>
        <RawPreview table={table} mapping={mapping} />
      </div>
    </div>
  );
}
