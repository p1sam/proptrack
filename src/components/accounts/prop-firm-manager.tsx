"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Building2, ExternalLink, Pencil, Plus, Trash2 } from "lucide-react";
import { clearPropFirmTemplate, deletePropFirm, savePropFirm } from "@/server/actions/accounts";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { RuleFields, hasAnyRule, ruleInputFrom, ruleStateFrom, type RuleFormState } from "./rule-fields";
import { FieldError, handleResult, type FieldErrors } from "./form-utils";

export interface FirmRow {
  id: string;
  name: string;
  website: string | null;
  notes: string | null;
  accountCount: number;
  ruleTemplate: Record<string, unknown> | null;
}

function FirmDialog({ firm, open, onOpenChange }: { firm: FirmRow | null; open: boolean; onOpenChange: (v: boolean) => void }) {
  const router = useRouter();
  const [name, setName] = useState(firm?.name ?? "");
  const [website, setWebsite] = useState(firm?.website ?? "");
  const [notes, setNotes] = useState(firm?.notes ?? "");
  const [useTemplate, setUseTemplate] = useState(!!firm?.ruleTemplate);
  const [rule, setRule] = useState<RuleFormState>(() => ruleStateFrom(firm?.ruleTemplate as never));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [pending, start] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const r = handleResult(
        await savePropFirm({
          id: firm?.id,
          name,
          website,
          notes,
          ruleTemplate: useTemplate && hasAnyRule(rule) ? ruleInputFrom(rule) : null,
        }),
        firm ? "Prop firm updated" : "Prop firm added",
      );
      if (!r.ok) return setErrors(r.fieldErrors);
      if (firm?.ruleTemplate && !(useTemplate && hasAnyRule(rule))) {
        const c = await clearPropFirmTemplate({ id: firm.id });
        if (!c.ok) toast.error(c.error);
      }
      onOpenChange(false);
      router.refresh();
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{firm ? `Edit ${firm.name}` : "Add prop firm"}</DialogTitle>
          <DialogDescription>A rule template pre-fills the rules of new accounts you add for this firm.</DialogDescription>
        </DialogHeader>
        <form id="firm-form" onSubmit={submit} className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="firm-name">Name</Label>
              <Input id="firm-name" required value={name} onChange={(e) => setName(e.target.value)} aria-invalid={!!errors.name} />
              <FieldError errors={errors.name} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="firm-web">Website</Label>
              <Input id="firm-web" type="url" placeholder="https://" value={website} onChange={(e) => setWebsite(e.target.value)} aria-invalid={!!errors.website} />
              <FieldError errors={errors.website} />
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="firm-notes">Notes</Label>
              <Textarea id="firm-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
            <Label htmlFor="firm-tpl">Default rule template for new accounts</Label>
            <Switch id="firm-tpl" checked={useTemplate} onCheckedChange={setUseTemplate} />
          </div>
          {useTemplate && <RuleFields value={rule} onChange={setRule} errors={errors} errorPrefix="ruleTemplate." idPrefix="firm-rule" />}
        </form>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" form="firm-form" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** List, add, edit and delete prop firms. Deleting a firm keeps its accounts (they become "No firm"). */
export function PropFirmManager({ firms }: { firms: FirmRow[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<FirmRow | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogKey, setDialogKey] = useState(0);
  const [deleting, setDeleting] = useState<FirmRow | null>(null);
  const [pending, start] = useTransition();

  const openFor = (f: FirmRow | null) => {
    setEditing(f);
    setDialogKey((k) => k + 1);
    setDialogOpen(true);
  };

  return (
    <div className="flex flex-col gap-3">
      {firms.length ? (
        <ul className="-my-1 divide-y">
          {firms.map((f) => (
            <li key={f.id} className="flex items-center gap-3 py-2">
              <Building2 className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 text-sm font-medium">
                  <span className="truncate">{f.name}</span>
                  {f.website && (
                    <a href={f.website} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-0.5 text-xs font-normal text-muted-foreground hover:text-foreground">
                      site <ExternalLink className="size-3" aria-hidden />
                    </a>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  {f.accountCount} account{f.accountCount === 1 ? "" : "s"}
                  {f.ruleTemplate ? " · rule template" : ""}
                </div>
              </div>
              <Button variant="ghost" size="icon-sm" aria-label={`Edit ${f.name}`} onClick={() => openFor(f)}>
                <Pencil />
              </Button>
              <Button variant="ghost" size="icon-sm" aria-label={`Delete ${f.name}`} onClick={() => setDeleting(f)}>
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No prop firms yet. Firms are also created when you add an account with a new firm name.</p>
      )}
      <Button variant="outline" size="sm" className="self-start" onClick={() => openFor(null)}>
        <Plus /> Add prop firm
      </Button>

      <FirmDialog key={dialogKey} firm={editing} open={dialogOpen} onOpenChange={setDialogOpen} />

      <AlertDialog open={!!deleting} onOpenChange={(v) => !v && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleting?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting?.accountCount
                ? `Its ${deleting.accountCount} account${deleting.accountCount === 1 ? "" : "s"} will be kept and shown as "No firm". Trades, fees and payouts are not affected.`
                : "This firm has no accounts."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={pending}
              onClick={(e) => {
                e.preventDefault();
                if (!deleting) return;
                start(async () => {
                  const r = handleResult(await deletePropFirm({ id: deleting.id }), "Prop firm deleted");
                  if (r.ok) {
                    setDeleting(null);
                    router.refresh();
                  }
                });
              }}
            >
              Delete firm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
