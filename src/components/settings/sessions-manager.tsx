"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { formatMinute } from "@/lib/calc/time";
import { TAG_COLORS } from "@/lib/defaults";
import { deleteSession, restoreDefaultSessions, saveSession } from "@/server/actions/settings";
import type { SessionRow } from "@/server/queries/settings";
import { ColorDot, ColorField, ConfirmDelete, describedBy, EditButton, EditDialog, Field, plural, useAction } from "./form-bits";
import { TimezoneSelect } from "./timezone-select";
import { sessionColor } from "./session-timeline";

type Draft = { id?: string; name: string; timezone: string; start: string; end: string; priority: string; color: string | null; isActive: boolean };

function toDraft(s: SessionRow | null, nextPriority: number, tz: string): Draft {
  return s
    ? { id: s.id, name: s.name, timezone: s.timezone, start: formatMinute(s.startMinute), end: formatMinute(s.endMinute), priority: String(s.priority), color: s.color, isActive: s.isActive }
    : { name: "", timezone: tz, start: "09:00", end: "17:00", priority: String(nextPriority), color: null, isActive: true };
}

const rebuiltMsg = (verb: string) => (d: { accounts: number }) => `${verb}. Recalculated sessions on ${plural(d.accounts, "account")}.`;

export function SessionsManager({ sessions, zones, defaultTz }: { sessions: SessionRow[]; zones: string[]; defaultTz: string }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const { run, pending, errors, setErrors } = useAction();
  const nextPriority = (sessions.at(-1)?.priority ?? 0) + 10;
  const totalTrades = sessions.reduce((n, s) => n + s.trades, 0);

  const open = (s: SessionRow | null) => {
    setErrors({});
    setDraft(toDraft(s, nextPriority, sessions[0]?.timezone ?? defaultTz));
  };
  const done = () => {
    setDraft(null);
    router.refresh();
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => open(null)}>
          <Plus /> Add session
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button type="button" variant="outline" disabled={pending}>
              <RotateCcw /> Restore defaults
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Restore default sessions?</AlertDialogTitle>
              <AlertDialogDescription>
                Asian, London, New York and London/NY Overlap are reset to their default New York-time windows and priorities, and re-activated. Your other sessions are kept. Every trade&apos;s session is recalculated.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => run(restoreDefaultSessions, {}, { success: rebuiltMsg("Default sessions restored"), onSuccess: () => router.refresh() })}>Restore</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {sessions.length === 0 ? (
        <p className="text-sm text-muted-foreground">No sessions. Trades will have no session until you add one or restore the defaults.</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">Priority</TableHead>
                <TableHead>Session</TableHead>
                <TableHead>Window</TableHead>
                <TableHead className="hidden md:table-cell">Timezone</TableHead>
                <TableHead className="text-right">Trades</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sessions.map((s, i) => (
                <TableRow key={s.id}>
                  <TableCell className="tabular">{s.priority}</TableCell>
                  <TableCell>
                    <span className="flex items-center gap-2">
                      <ColorDot color={sessionColor(s, i)} />
                      <span className="font-medium">{s.name}</span>
                      {!s.isActive && <Badge variant="outline">Inactive</Badge>}
                    </span>
                  </TableCell>
                  <TableCell className="tabular">
                    {formatMinute(s.startMinute)}–{formatMinute(s.endMinute)}
                    {s.endMinute < s.startMinute && <span className="ml-1 text-xs text-muted-foreground">(wraps midnight)</span>}
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">{s.timezone.replace(/_/g, " ")}</TableCell>
                  <TableCell className="text-right tabular">{s.trades}</TableCell>
                  <TableCell>
                    <div className="flex justify-end">
                      <EditButton label={s.name} onClick={() => open(s)} />
                      <ConfirmDelete
                        title={s.name}
                        pending={pending}
                        description={
                          <>
                            <p>
                              {s.trades > 0 ? `${plural(s.trades, "trade")} currently tagged ${s.name} will be reassigned to the next matching session (or none).` : "No trades are tagged with this session."}
                            </p>
                            <p>Every account is recalculated.</p>
                          </>
                        }
                        onConfirm={() => run(deleteSession, { id: s.id }, { success: rebuiltMsg(`${s.name} deleted`), onSuccess: () => router.refresh() })}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {totalTrades > 0 && <p className="text-xs text-muted-foreground">Saving, deleting or restoring sessions reassigns the session of all {plural(totalTrades, "tagged trade")}.</p>}

      {draft && (
        <EditDialog
          open
          onOpenChange={(v) => !v && setDraft(null)}
          title={draft.id ? `Edit ${draft.name || "session"}` : "Add session"}
          description="Times are wall-clock times in the session's timezone, so daylight-saving changes are handled automatically."
          pending={pending}
          onSubmit={() => run(saveSession, draft, { success: rebuiltMsg(draft.id ? "Session saved" : "Session added"), onSuccess: done })}
        >
          <Field id="ses-name" label="Name" error={errors.name}>
            <Input id="ses-name" value={draft.name} maxLength={40} required onChange={(e) => setDraft({ ...draft, name: e.target.value })} {...describedBy("ses-name", errors.name)} />
          </Field>
          <Field id="ses-tz" label="Timezone" error={errors.timezone}>
            <TimezoneSelect id="ses-tz" value={draft.timezone} zones={zones} onChange={(timezone) => setDraft({ ...draft, timezone })} invalid={!!errors.timezone?.length} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field id="ses-start" label="Start (HH:MM)" error={errors.start}>
              <Input id="ses-start" type="time" value={draft.start} required onChange={(e) => setDraft({ ...draft, start: e.target.value })} {...describedBy("ses-start", errors.start)} />
            </Field>
            <Field id="ses-end" label="End (HH:MM)" hint="An end before the start wraps past midnight." error={errors.end}>
              <Input id="ses-end" type="time" value={draft.end} required onChange={(e) => setDraft({ ...draft, end: e.target.value })} {...describedBy("ses-end", errors.end)} />
            </Field>
          </div>
          <Field id="ses-priority" label="Priority" hint="Lower numbers are checked first; the first matching session wins." error={errors.priority}>
            <Input id="ses-priority" inputMode="numeric" value={draft.priority} required onChange={(e) => setDraft({ ...draft, priority: e.target.value })} {...describedBy("ses-priority", errors.priority)} />
          </Field>
          <ColorField id="ses-color" value={draft.color} fallback={TAG_COLORS.NEUTRAL} onChange={(color) => setDraft({ ...draft, color })} error={errors.color} />
          <div className="flex items-center gap-2">
            <Switch id="ses-active" checked={draft.isActive} onCheckedChange={(isActive) => setDraft({ ...draft, isActive })} />
            <Label htmlFor="ses-active">Active — inactive sessions are skipped when assigning trades</Label>
          </div>
        </EditDialog>
      )}
    </div>
  );
}
