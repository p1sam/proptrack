"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/format";
import { deleteExchangeRate, saveExchangeRate } from "@/server/actions/settings";
import type { RateRow } from "@/server/queries/settings";
import { ConfirmDelete, describedBy, EditButton, EditDialog, Field, useAction } from "./form-bits";

type Draft = { id?: string; base: string; quote: string; rate: string };

const fmtRate = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 8 });

export function RatesManager({ rates, defaultCurrency, missing, timezone }: { rates: RateRow[]; defaultCurrency: string; missing: string[]; timezone: string }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const { run, pending, errors, setErrors } = useAction();
  const refresh = () => router.refresh();
  const open = (d: Draft) => {
    setErrors({});
    setDraft(d);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => open({ base: missing[0] ?? "", quote: defaultCurrency, rate: "" })}>
          <Plus /> Add rate
        </Button>
        {missing.map((c) => (
          <Button key={c} type="button" variant="outline" onClick={() => open({ base: c, quote: defaultCurrency, rate: "" })}>
            <Plus /> {c}/{defaultCurrency}
          </Button>
        ))}
      </div>
      {rates.length === 0 ? (
        <p className="text-sm text-muted-foreground">No exchange rates yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Pair</TableHead>
                <TableHead className="text-right">Rate</TableHead>
                <TableHead className="hidden text-right sm:table-cell">Inverse</TableHead>
                <TableHead className="hidden md:table-cell">Updated</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rates.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">
                    {r.base}/{r.quote}
                  </TableCell>
                  <TableCell className="text-right tabular">
                    1 {r.base} = {fmtRate(r.rate)} {r.quote}
                  </TableCell>
                  <TableCell className="hidden text-right text-muted-foreground tabular sm:table-cell">
                    1 {r.quote} = {fmtRate(1 / r.rate)} {r.base}
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">{formatDate(r.updatedAt, timezone)}</TableCell>
                  <TableCell>
                    <div className="flex justify-end">
                      <EditButton label={`${r.base}/${r.quote}`} onClick={() => open({ id: r.id, base: r.base, quote: r.quote, rate: String(r.rate) })} />
                      <ConfirmDelete
                        title={`${r.base}/${r.quote}`}
                        pending={pending}
                        description={<p>Amounts in {r.base === defaultCurrency ? r.quote : r.base} that rely on this rate will be excluded from portfolio totals (and disclosed) until you add a rate again.</p>}
                        onConfirm={() => run(deleteExchangeRate, { id: r.id }, { success: `${r.base}/${r.quote} deleted`, onSuccess: refresh })}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {draft && (
        <EditDialog
          open
          onOpenChange={(v) => !v && setDraft(null)}
          title={draft.id ? `Edit ${draft.base}/${draft.quote}` : "Add exchange rate"}
          description="1 unit of the base currency equals the rate in the quote currency. The inverse is derived automatically."
          pending={pending}
          onSubmit={() =>
            run(saveExchangeRate, draft, {
              success: "Rate saved",
              onSuccess: () => {
                setDraft(null);
                refresh();
              },
            })
          }
        >
          <div className="grid grid-cols-2 gap-3">
            <Field id="fx-base" label="Base" error={errors.base}>
              <Input id="fx-base" className="uppercase" maxLength={3} required value={draft.base} onChange={(e) => setDraft({ ...draft, base: e.target.value.toUpperCase() })} {...describedBy("fx-base", errors.base)} />
            </Field>
            <Field id="fx-quote" label="Quote" error={errors.quote}>
              <Input id="fx-quote" className="uppercase" maxLength={3} required value={draft.quote} onChange={(e) => setDraft({ ...draft, quote: e.target.value.toUpperCase() })} {...describedBy("fx-quote", errors.quote)} />
            </Field>
          </div>
          <Field id="fx-rate" label="Rate" hint={draft.base && draft.quote ? `1 ${draft.base} = ? ${draft.quote}` : undefined} error={errors.rate}>
            <Input id="fx-rate" inputMode="decimal" required value={draft.rate} onChange={(e) => setDraft({ ...draft, rate: e.target.value })} {...describedBy("fx-rate", errors.rate)} />
          </Field>
        </EditDialog>
      )}
    </div>
  );
}
