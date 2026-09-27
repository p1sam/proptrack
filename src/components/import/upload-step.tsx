"use client";

import { useId, useRef, useState } from "react";
import { Download, FileText, Upload } from "lucide-react";
import { ACCEPTED_EXTENSIONS, MAX_FILE_BYTES } from "@/lib/import/csv";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TimezoneField } from "./timezone-field";

export interface WizardAccount {
  id: string;
  name: string;
  status: string;
  currency: string;
  accountNumber: string | null;
  trades: number;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

export function UploadStep({
  accounts,
  accountId,
  onAccountChange,
  timeZone,
  onTimeZoneChange,
  userTimezone,
  file,
  onFile,
  loading,
}: {
  accounts: WizardAccount[];
  accountId: string;
  onAccountChange: (id: string) => void;
  timeZone: string;
  onTimeZoneChange: (tz: string) => void;
  userTimezone: string;
  file: { name: string; size: number; rows: number } | null;
  onFile: (file: File) => void;
  loading: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const accountLabelId = useId();
  const dropId = useId();

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label id={accountLabelId}>Import into account</Label>
          <Select value={accountId} onValueChange={onAccountChange}>
            <SelectTrigger aria-labelledby={accountLabelId} className="w-full sm:w-80">
              <SelectValue placeholder="Choose an account" />
            </SelectTrigger>
            <SelectContent>
              {accounts.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                  <span className="text-muted-foreground">
                    {a.accountNumber ? ` · ${a.accountNumber}` : ""} · {a.trades} trades
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">Duplicates are checked against this account&apos;s existing trades.</p>
        </div>
        <TimezoneField value={timeZone} onChange={onTimeZoneChange} userTimezone={userTimezone} />
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const f = e.dataTransfer.files?.[0];
          if (f) onFile(f);
        }}
        className={cn(
          "flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed px-6 py-10 text-center transition-colors",
          dragging ? "border-primary bg-primary/5" : "bg-muted/20",
        )}
      >
        <Upload className="size-6 text-muted-foreground" aria-hidden />
        <div>
          <p className="text-sm font-medium" id={dropId}>
            Drop a CSV file here, or choose one
          </p>
          <p className="text-xs text-muted-foreground">
            {ACCEPTED_EXTENSIONS.join(", ")} · up to {formatBytes(MAX_FILE_BYTES)} · comma, semicolon or tab separated. The file is read in your browser.
          </p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={[...ACCEPTED_EXTENSIONS, "text/csv", "text/plain", "text/tab-separated-values"].join(",")}
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
            e.target.value = "";
          }}
        />
        <Button type="button" variant="outline" onClick={() => inputRef.current?.click()} disabled={loading} aria-describedby={dropId}>
          <FileText /> {file ? "Choose another file" : "Choose file"}
        </Button>
        {file && (
          <p className="text-sm" role="status">
            <span className="font-medium">{file.name}</span> <span className="text-muted-foreground">· {formatBytes(file.size)} · {file.rows} data rows</span>
          </p>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Not sure about the format?{" "}
        <a href="/templates/trades-template.csv" download className="inline-flex items-center gap-1 text-foreground underline underline-offset-2">
          <Download className="size-3" /> Download the sample CSV template
        </a>
        . Any column order works — you map the columns in the next steps.
      </p>
    </div>
  );
}
