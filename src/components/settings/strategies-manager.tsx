"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Archive, ArchiveRestore, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TAG_COLORS } from "@/lib/defaults";
import { deleteStrategy, saveStrategy, setStrategyArchived } from "@/server/actions/settings";
import type { StrategyRow } from "@/server/queries/settings";
import { ColorDot, ColorField, ConfirmDelete, describedBy, EditButton, EditDialog, Field, plural, useAction } from "./form-bits";

type Draft = { id?: string; name: string; description: string; color: string | null; isArchived: boolean };

export function StrategiesManager({ strategies }: { strategies: StrategyRow[] }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const { run, pending, errors, setErrors } = useAction();
  const refresh = () => router.refresh();

  const open = (s: StrategyRow | null) => {
    setErrors({});
    setDraft(s ? { id: s.id, name: s.name, description: s.description ?? "", color: s.color, isArchived: s.isArchived } : { name: "", description: "", color: null, isArchived: false });
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Button type="button" onClick={() => open(null)}>
          <Plus /> Add strategy
        </Button>
      </div>
      {strategies.length === 0 ? (
        <p className="text-sm text-muted-foreground">No strategies yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Strategy</TableHead>
                <TableHead className="hidden md:table-cell">Description</TableHead>
                <TableHead className="text-right">Trades</TableHead>
                <TableHead className="w-28" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {strategies.map((s) => (
                <TableRow key={s.id} className={s.isArchived ? "text-muted-foreground" : undefined}>
                  <TableCell>
                    <span className="flex items-center gap-2">
                      <ColorDot color={s.color} />
                      <Link href={`/strategies/${s.id}`} className="font-medium hover:underline">
                        {s.name}
                      </Link>
                      {s.isArchived && <Badge variant="outline">Archived</Badge>}
                    </span>
                  </TableCell>
                  <TableCell className="hidden max-w-md truncate text-muted-foreground md:table-cell">{s.description ?? "—"}</TableCell>
                  <TableCell className="text-right tabular">{s.trades}</TableCell>
                  <TableCell>
                    <div className="flex justify-end">
                      <EditButton label={s.name} onClick={() => open(s)} />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        disabled={pending}
                        aria-label={s.isArchived ? `Unarchive ${s.name}` : `Archive ${s.name}`}
                        title={s.isArchived ? "Unarchive" : "Archive — hidden from new-trade pickers, history kept"}
                        onClick={() => run(setStrategyArchived, { id: s.id, archived: !s.isArchived }, { success: s.isArchived ? `${s.name} restored` : `${s.name} archived`, onSuccess: refresh })}
                      >
                        {s.isArchived ? <ArchiveRestore /> : <Archive />}
                      </Button>
                      <ConfirmDelete
                        title={s.name}
                        pending={pending}
                        description={
                          <>
                            <p>{s.trades > 0 ? `${plural(s.trades, "trade")} will lose this strategy (the trades themselves are kept).` : "No trades use this strategy."}</p>
                            {s.trades > 0 && <p>To keep the history but hide it from pickers, archive it instead.</p>}
                          </>
                        }
                        onConfirm={() => run(deleteStrategy, { id: s.id }, { success: `${s.name} deleted`, onSuccess: refresh })}
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
          title={draft.id ? `Edit ${draft.name || "strategy"}` : "Add strategy"}
          pending={pending}
          onSubmit={() =>
            run(saveStrategy, draft, {
              success: draft.id ? "Strategy saved" : "Strategy added",
              onSuccess: () => {
                setDraft(null);
                refresh();
              },
            })
          }
        >
          <Field id="str-name" label="Name" hint="Must be unique." error={errors.name}>
            <Input id="str-name" value={draft.name} maxLength={60} required onChange={(e) => setDraft({ ...draft, name: e.target.value })} {...describedBy("str-name", errors.name)} />
          </Field>
          <Field id="str-desc" label="Description" hint="Optional: the rules of the setup, when you take it and when you don't." error={errors.description}>
            <Textarea id="str-desc" rows={4} maxLength={1000} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} {...describedBy("str-desc", errors.description)} />
          </Field>
          <ColorField id="str-color" value={draft.color} fallback={TAG_COLORS.NEUTRAL} onChange={(color) => setDraft({ ...draft, color })} error={errors.color} />
        </EditDialog>
      )}
    </div>
  );
}
