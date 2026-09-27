"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { detectFileAdapter, getFileAdapter } from "@/lib/import/adapters";
import { ACCEPTED_EXTENSIONS, MAX_FILE_BYTES, parseCsv, type ParsedTable } from "@/lib/import/csv";
import { detectDateFormat, isValidTimeZone, type DateFormat } from "@/lib/import/dates";
import { emptyMapping, normalizeHeader, validateMapping, type ColumnMapping, type ImportField } from "@/lib/import/fields";
import { summarize, type NormalizedTrade } from "@/lib/import/normalize";
import { detectDecimalSeparator } from "@/lib/import/numbers";
import { chunk, CLIENT_CHUNK_SIZE, toWireTrade } from "@/lib/import/schema";
import { checkImportDuplicatesAction, importTrades } from "@/server/actions/import";
import { undoImport } from "@/server/actions/import";
import { Button } from "@/components/ui/button";
import { Stepper } from "./stepper";
import { UploadStep, type WizardAccount } from "./upload-step";
import { DetectStep, type DecimalChoice } from "./detect-step";
import { MappingStep } from "./mapping-step";
import { PreviewStep } from "./preview-step";
import { DuplicatesStep, type DupState } from "./duplicates-step";
import { ImportStep, type ImportOutcome } from "./import-step";

const STEPS = [
  { id: "upload", label: "Upload" },
  { id: "detect", label: "Detect columns" },
  { id: "map", label: "Map columns" },
  { id: "preview", label: "Preview" },
  { id: "validate", label: "Duplicates" },
  { id: "import", label: "Import" },
];
const DUP_CHECK_CHUNK = 2000;

function guessProfitIsNet(headers: string[], mapping: ColumnMapping): boolean {
  if (mapping.profit === null) return false;
  return normalizeHeader(headers[mapping.profit]).includes("net");
}

export function ImportWizard({ accounts, defaultAccountId, userTimezone }: { accounts: WizardAccount[]; defaultAccountId?: string; userTimezone: string }) {
  const [step, setStep] = useState(0);
  const [reached, setReached] = useState(0);
  const [file, setFile] = useState<{ name: string; size: number; rows: number } | null>(null);
  const [table, setTable] = useState<ParsedTable | null>(null);
  const [loading, setLoading] = useState(false);
  const [accountId, setAccountId] = useState(defaultAccountId && accounts.some((a) => a.id === defaultAccountId) ? defaultAccountId : (accounts[0]?.id ?? ""));
  const [timeZone, setTimeZone] = useState(userTimezone);
  const [adapterId, setAdapterId] = useState("generic-csv");
  const [mapping, setMapping] = useState<ColumnMapping>(emptyMapping());
  const [detectedMapping, setDetectedMapping] = useState<ColumnMapping>(emptyMapping());
  const [dateFormat, setDateFormat] = useState<DateFormat>("auto");
  const [decimalChoice, setDecimalChoice] = useState<DecimalChoice>("auto");
  const [profitIsNet, setProfitIsNet] = useState(false);
  const [dup, setDup] = useState<DupState | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkProgress, setCheckProgress] = useState(0);
  const [allow, setAllow] = useState<Set<number>>(new Set());
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null);
  const [undoing, setUndoing] = useState(false);

  const account = accounts.find((a) => a.id === accountId);
  const tz = timeZone.trim();
  const tzValid = tz !== "" && isValidTimeZone(tz);
  const adapter = getFileAdapter(adapterId);

  const colSamples = (cols: (number | null)[]) =>
    table ? table.rows.slice(0, 500).flatMap((r) => cols.filter((c): c is number => c !== null).map((c) => r[c] ?? "")).filter((v) => v.trim()) : [];
  const dateDetection = useMemo(() => detectDateFormat(colSamples([mapping.openedAt, mapping.closedAt])), [table, mapping.openedAt, mapping.closedAt]); // eslint-disable-line react-hooks/exhaustive-deps
  const decimalDetected = useMemo(
    () => detectDecimalSeparator(colSamples([mapping.entryPrice, mapping.exitPrice, mapping.profit, mapping.quantity, mapping.commission])),
    [table, mapping.entryPrice, mapping.exitPrice, mapping.profit, mapping.quantity, mapping.commission], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const decimal = decimalChoice === "auto" ? (decimalDetected === "ambiguous" ? "." : decimalDetected) : decimalChoice;
  const effectiveDateFormat: DateFormat = dateFormat === "auto" && !dateDetection.ambiguous ? dateDetection.format : dateFormat;

  const rows = useMemo(
    () => (table && tzValid ? adapter.parse({ table, mapping, options: { timeZone: tz, dateFormat: effectiveDateFormat, decimal, profitIsNet } }) : []),
    [table, tzValid, adapter, mapping, tz, effectiveDateFormat, decimal, profitIsNet],
  );
  const summary = useMemo(() => summarize(rows), [rows]);
  const trades = useMemo(() => rows.flatMap((r) => (r.trade ? [r.trade] : [])), [rows]);
  // Duplicate results are only valid for the exact trades/account they were computed for.
  const dupKey = useMemo(() => `${accountId}|${trades.length}|${trades.map((t) => `${t.rowIndex}:${t.symbol}:${t.openedAt.getTime()}:${t.entryPrice}:${t.quantity}`).join(",")}`, [accountId, trades]);
  const dupValid = dup !== null && dup.key === dupKey;

  const isDup = (t: NormalizedTrade) => dupValid && (dup!.existing.has(t.rowIndex) || dup!.file.has(t.rowIndex));
  const toSend = trades.filter((t) => !isDup(t) || allow.has(t.rowIndex));
  const dupTotal = trades.filter(isDup).length;
  const dupAllowed = trades.filter((t) => isDup(t) && allow.has(t.rowIndex)).length;

  const mappingProblems = validateMapping(mapping);
  const needsDateChoice = dateDetection.ambiguous && dateFormat !== "dmy" && dateFormat !== "mdy";

  const canAdvance = [
    Boolean(table && table.rows.length && accountId && tzValid),
    !needsDateChoice,
    mappingProblems.errors.length === 0,
    trades.length > 0,
    dupValid && !checking,
    false,
  ][step];

  const go = (next: number) => {
    setStep(next);
    setReached((r) => Math.max(r, next));
    if (next === 4 && !dupValid && !checking) void runDuplicateCheck();
  };

  async function onFile(f: File) {
    const ext = f.name.slice(f.name.lastIndexOf(".")).toLowerCase();
    if (!ACCEPTED_EXTENSIONS.includes(ext)) return toast.error(`Unsupported file type. Use ${ACCEPTED_EXTENSIONS.join(", ")}.`);
    if (f.size > MAX_FILE_BYTES) return toast.error("The file is larger than 5 MB. Split it into smaller files.");
    setLoading(true);
    try {
      const parsed = parseCsv(await f.text());
      if (!parsed.headers.length || !parsed.rows.length) {
        toast.error("No data rows found in the file.");
        return;
      }
      const a = detectFileAdapter(parsed.headers);
      const m = a.suggestMapping(parsed.headers, parsed.rows.slice(0, 50));
      setTable(parsed);
      setFile({ name: f.name, size: f.size, rows: parsed.rows.length });
      setAdapterId(a.id);
      setMapping(m);
      setDetectedMapping(m);
      setDateFormat(a.defaults.dateFormat ?? "auto");
      setDecimalChoice(a.defaults.decimal ?? "auto");
      setProfitIsNet(a.defaults.profitIsNet ?? guessProfitIsNet(parsed.headers, m));
      setDup(null);
      setAllow(new Set());
      setOutcome(null);
      setReached(0);
      toast.success(`Read ${parsed.rows.length.toLocaleString("en-US")} rows${a.id !== "generic-csv" ? ` · detected ${a.label}` : ""}`);
    } catch (e) {
      console.error(e);
      toast.error("Could not read the file. Is it a text CSV?");
    } finally {
      setLoading(false);
    }
  }

  function changeAdapter(id: string) {
    if (!table) return;
    const a = getFileAdapter(id);
    const m = a.suggestMapping(table.headers, table.rows.slice(0, 50));
    setAdapterId(a.id);
    setMapping(m);
    setDetectedMapping(m);
    if (a.defaults.dateFormat) setDateFormat(a.defaults.dateFormat);
    if (a.defaults.decimal) setDecimalChoice(a.defaults.decimal);
    setProfitIsNet(a.defaults.profitIsNet ?? guessProfitIsNet(table.headers, m));
  }

  async function runDuplicateCheck() {
    if (!trades.length) return;
    setChecking(true);
    setCheckProgress(0);
    const existing: DupState["existing"] = new Map();
    const fileDups: DupState["file"] = new Map();
    try {
      const parts = chunk(trades, DUP_CHECK_CHUNK);
      for (let i = 0; i < parts.length; i++) {
        const res = await checkImportDuplicatesAction({
          accountId,
          rows: parts[i].map((t) => ({ row: t.rowIndex, symbol: t.symbol, direction: t.direction, openedAt: t.openedAt.toISOString(), closedAt: t.closedAt?.toISOString() ?? null, entryPrice: t.entryPrice, exitPrice: t.exitPrice, exitPriceKnown: t.exitPriceKnown, quantity: t.quantity })),
        });
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        for (const e of res.data.existing) existing.set(e.row, e);
        for (const f of res.data.file) fileDups.set(f.row, f);
        setCheckProgress(((i + 1) / parts.length) * 100);
      }
      // Across chunks: repeats of rows in earlier chunks.
      if (parts.length > 1) {
        const { findFileDuplicates } = await import("@/lib/import/duplicates");
        for (const f of findFileDuplicates(accountId, trades.map((t) => ({ ...t, row: t.rowIndex })))) if (!fileDups.has(f.row)) fileDups.set(f.row, f);
      }
      setDup({ key: dupKey, existing, file: fileDups });
      setAllow(new Set());
    } finally {
      setChecking(false);
    }
  }

  async function runImport() {
    if (!account || !file) return;
    setImporting(true);
    setImportProgress(0);
    const parts = chunk(toSend, CLIENT_CHUNK_SIZE);
    const clientSkipped = summary.total - toSend.length;
    let batchId: string | undefined;
    let imported = 0;
    let skippedDuplicates = dupTotal - dupAllowed;
    let instrumentsCreated = 0;
    try {
      for (let i = 0; i < parts.length; i++) {
        const res = await importTrades({
          accountId,
          source: adapter.id,
          filename: file.name,
          batchId,
          fileRows: i === 0 ? summary.total : 0,
          clientSkipped: i === 0 ? clientSkipped : 0,
          rows: parts[i].map((t) => toWireTrade(t, allow.has(t.rowIndex))),
        });
        if (!res.ok) {
          toast.error(imported ? `${res.error} — ${imported} trades were imported before the error; you can undo them below.` : res.error);
          if (batchId) setOutcome({ batchId, accountId, accountName: account.name, imported, skippedDuplicates, skippedErrors: summary.error, skippedLines: summary.skipped, instrumentsCreated });
          return;
        }
        batchId = res.data.batchId;
        imported += res.data.imported;
        skippedDuplicates += res.data.skippedDuplicates + res.data.skippedInFile;
        instrumentsCreated += res.data.instrumentsCreated;
        setImportProgress(((i + 1) / parts.length) * 100);
      }
      if (batchId) {
        setOutcome({ batchId, accountId, accountName: account.name, imported, skippedDuplicates, skippedErrors: summary.error, skippedLines: summary.skipped, instrumentsCreated });
        toast.success(`Imported ${imported} trade${imported === 1 ? "" : "s"}`);
      }
    } finally {
      setImporting(false);
    }
  }

  async function runUndo() {
    if (!outcome) return;
    setUndoing(true);
    const res = await undoImport({ batchId: outcome.batchId });
    setUndoing(false);
    if (res.ok) {
      toast.success(`Import undone — ${res.data.deleted} trades deleted`);
      setOutcome({ ...outcome, undone: true });
      setDup(null);
    } else toast.error(res.error);
  }

  function reset() {
    setStep(0);
    setReached(0);
    setFile(null);
    setTable(null);
    setMapping(emptyMapping());
    setDup(null);
    setAllow(new Set());
    setOutcome(null);
  }

  const setField = (field: ImportField, idx: number | null) => setMapping((m) => ({ ...m, [field]: idx }));

  return (
    <div className="flex flex-col gap-5">
      <Stepper steps={STEPS} current={step} reached={outcome ? step : reached} onSelect={(i) => !importing && !outcome && go(i)} />
      <div className="min-h-64" aria-live="polite">
        <h2 className="sr-only">{STEPS[step].label}</h2>
        {step === 0 && (
          <UploadStep
            accounts={accounts}
            accountId={accountId}
            onAccountChange={(id) => {
              setAccountId(id);
              setDup(null);
            }}
            timeZone={timeZone}
            onTimeZoneChange={setTimeZone}
            userTimezone={userTimezone}
            file={file}
            onFile={onFile}
            loading={loading}
          />
        )}
        {step === 1 && table && file && (
          <DetectStep
            file={file}
            table={table}
            mapping={mapping}
            adapterId={adapterId}
            onAdapterChange={changeAdapter}
            dateFormat={dateFormat}
            onDateFormatChange={setDateFormat}
            dateDetection={dateDetection}
            decimalChoice={decimalChoice}
            onDecimalChange={setDecimalChoice}
            decimalDetected={decimalDetected}
            timeZone={tz}
          />
        )}
        {step === 2 && table && (
          <MappingStep table={table} mapping={mapping} onChange={setField} onReset={() => setMapping(detectedMapping)} profitIsNet={profitIsNet} onProfitIsNetChange={setProfitIsNet} />
        )}
        {step === 3 && <PreviewStep rows={rows} summary={summary} displayTz={userTimezone} currency={account?.currency ?? "USD"} />}
        {step === 4 && (
          <DuplicatesStep
            trades={trades}
            dup={dupValid ? dup : null}
            checking={checking}
            progress={checkProgress}
            allow={allow}
            onAllowChange={(list, value) =>
              setAllow((prev) => {
                const next = new Set(prev);
                for (const r of list) {
                  if (value) next.add(r);
                  else next.delete(r);
                }
                return next;
              })
            }
            onRetry={runDuplicateCheck}
            displayTz={userTimezone}
          />
        )}
        {step === 5 && (
          <ImportStep
            accountName={account?.name ?? ""}
            toImport={toSend.length}
            duplicatesSkipped={dupTotal - dupAllowed}
            duplicatesAllowed={dupAllowed}
            errors={summary.error}
            skippedLines={summary.skipped}
            importing={importing}
            progress={importProgress}
            outcome={outcome}
            onImport={runImport}
            onUndo={runUndo}
            onReset={reset}
            undoing={undoing}
          />
        )}
      </div>
      {!outcome && (
        <div className="flex items-center justify-between gap-2 border-t pt-4">
          <Button type="button" variant="outline" onClick={() => go(step - 1)} disabled={step === 0 || importing}>
            <ArrowLeft /> Back
          </Button>
          {step < STEPS.length - 1 && (
            <Button type="button" onClick={() => go(step + 1)} disabled={!canAdvance}>
              Next: {STEPS[step + 1].label} <ArrowRight />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
