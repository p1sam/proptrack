"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { deleteInstrument, saveInstrument } from "@/server/actions/settings";
import type { InstrumentRow } from "@/server/queries/settings";
import { ConfirmDelete, describedBy, EditButton, EditDialog, Field, plural, useAction } from "./form-bits";

export const ASSET_CLASS_LABEL = {
  FOREX: "Forex",
  INDEX: "Index",
  COMMODITY: "Commodity",
  CRYPTO: "Crypto",
  STOCK: "Stock",
  FUTURES: "Futures",
  OTHER: "Other",
} as const;
type AssetClass = keyof typeof ASSET_CLASS_LABEL;

type Draft = { id?: string; symbol: string; name: string; assetClass: AssetClass; pointValue: string; tickSize: string; trades: number };

const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 10 });

export function InstrumentsManager({ instruments }: { instruments: InstrumentRow[] }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const { run, pending, errors, setErrors } = useAction();
  const refresh = () => router.refresh();

  const open = (i: InstrumentRow | null) => {
    setErrors({});
    setDraft(
      i
        ? { id: i.id, symbol: i.symbol, name: i.name ?? "", assetClass: i.assetClass, pointValue: String(i.pointValue), tickSize: i.tickSize === null ? "" : String(i.tickSize), trades: i.trades }
        : { symbol: "", name: "", assetClass: "FOREX", pointValue: "", tickSize: "", trades: 0 },
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Button type="button" onClick={() => open(null)}>
          <Plus /> Add instrument
        </Button>
      </div>
      {instruments.length === 0 ? (
        <p className="text-sm text-muted-foreground">No instruments yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Symbol</TableHead>
                <TableHead className="hidden sm:table-cell">Name</TableHead>
                <TableHead className="hidden md:table-cell">Asset class</TableHead>
                <TableHead className="text-right">Point value</TableHead>
                <TableHead className="hidden text-right md:table-cell">Tick size</TableHead>
                <TableHead className="text-right">Trades</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {instruments.map((i) => (
                <TableRow key={i.id}>
                  <TableCell className="font-medium">{i.symbol}</TableCell>
                  <TableCell className="hidden text-muted-foreground sm:table-cell">{i.name ?? "—"}</TableCell>
                  <TableCell className="hidden md:table-cell">{ASSET_CLASS_LABEL[i.assetClass]}</TableCell>
                  <TableCell className="text-right tabular">{fmt(i.pointValue)}</TableCell>
                  <TableCell className="hidden text-right tabular md:table-cell">{i.tickSize === null ? "—" : fmt(i.tickSize)}</TableCell>
                  <TableCell className="text-right tabular">{i.trades}</TableCell>
                  <TableCell>
                    <div className="flex justify-end">
                      <EditButton label={i.symbol} onClick={() => open(i)} />
                      {i.trades > 0 ? (
                        <span className="sr-only">{`${i.symbol} is used by ${plural(i.trades, "trade")} and can't be deleted`}</span>
                      ) : (
                        <ConfirmDelete title={i.symbol} pending={pending} description={<p>No trades use {i.symbol}. It will be removed from the instrument picker.</p>} onConfirm={() => run(deleteInstrument, { id: i.id }, { success: `${i.symbol} deleted`, onSuccess: refresh })} />
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <p className="text-xs text-muted-foreground">Instruments used by trades can&apos;t be deleted, and their symbol can&apos;t change.</p>

      {draft && (
        <EditDialog
          open
          onOpenChange={(v) => !v && setDraft(null)}
          title={draft.id ? `Edit ${draft.symbol}` : "Add instrument"}
          description={draft.id && draft.trades > 0 ? `Existing ${plural(draft.trades, "trade")} keep the point value they were entered with; the new value applies to new trades.` : undefined}
          pending={pending}
          onSubmit={() =>
            run(saveInstrument, draft, {
              success: draft.id ? "Instrument saved" : "Instrument added",
              onSuccess: () => {
                setDraft(null);
                refresh();
              },
            })
          }
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="ins-symbol" label="Symbol" hint={draft.trades > 0 ? "Locked: used by trades." : "Unique, e.g. EURUSD."} error={errors.symbol}>
              <Input
                id="ins-symbol"
                className="uppercase"
                value={draft.symbol}
                maxLength={30}
                required
                readOnly={draft.trades > 0}
                onChange={(e) => setDraft({ ...draft, symbol: e.target.value.toUpperCase() })}
                {...describedBy("ins-symbol", errors.symbol)}
              />
            </Field>
            <Field id="ins-class" label="Asset class" error={errors.assetClass}>
              <Select value={draft.assetClass} onValueChange={(v) => setDraft({ ...draft, assetClass: v as AssetClass })}>
                <SelectTrigger id="ins-class" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(ASSET_CLASS_LABEL) as AssetClass[]).map((k) => (
                    <SelectItem key={k} value={k}>
                      {ASSET_CLASS_LABEL[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field id="ins-name" label="Name" error={errors.name}>
            <Input id="ins-name" value={draft.name} maxLength={80} placeholder="e.g. Euro / US Dollar" onChange={(e) => setDraft({ ...draft, name: e.target.value })} {...describedBy("ins-name", errors.name)} />
          </Field>
          <Field
            id="ins-pv"
            label="Point value"
            hint="Account-currency value of a 1.0 price move per 1 unit of quantity, e.g. 100000 for a standard FX lot on a USD-quoted pair."
            error={errors.pointValue}
          >
            <Input id="ins-pv" inputMode="decimal" value={draft.pointValue} required onChange={(e) => setDraft({ ...draft, pointValue: e.target.value })} {...describedBy("ins-pv", errors.pointValue)} />
          </Field>
          <Field id="ins-tick" label="Tick size" hint="Optional: smallest price increment, e.g. 0.00001." error={errors.tickSize}>
            <Input id="ins-tick" inputMode="decimal" value={draft.tickSize} onChange={(e) => setDraft({ ...draft, tickSize: e.target.value })} {...describedBy("ins-tick", errors.tickSize)} />
          </Field>
        </EditDialog>
      )}
    </div>
  );
}
