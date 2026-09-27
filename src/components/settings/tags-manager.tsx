"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TAG_COLORS } from "@/lib/defaults";
import { deleteCategory, deleteTag, saveCategory, saveTag } from "@/server/actions/settings";
import type { CategoryRow, TagRow } from "@/server/queries/settings";
import type { SettingsCategoryKind } from "./logic";
import { ColorDot, ColorField, ConfirmDelete, describedBy, EditButton, EditDialog, Field, plural, useAction } from "./form-bits";

const TAG_KIND_LABEL = { POSITIVE: "Positive", MISTAKE: "Mistake", NEUTRAL: "Neutral" } as const;
type TagKind = keyof typeof TAG_KIND_LABEL;

type TagDraft = { id?: string; name: string; kind: TagKind; color: string | null; isDefault: boolean };

export function TagsManager({ tags }: { tags: TagRow[] }) {
  const router = useRouter();
  const [draft, setDraft] = useState<TagDraft | null>(null);
  const { run, pending, errors, setErrors } = useAction();
  const refresh = () => router.refresh();

  const open = (t: TagRow | null) => {
    setErrors({});
    setDraft(t ? { id: t.id, name: t.name, kind: t.kind, color: t.color, isDefault: t.isDefault } : { name: "", kind: "NEUTRAL", color: null, isDefault: false });
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Button type="button" onClick={() => open(null)}>
          <Plus /> Add tag
        </Button>
      </div>
      {tags.length === 0 ? (
        <p className="text-sm text-muted-foreground">No tags yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tag</TableHead>
                <TableHead>Kind</TableHead>
                <TableHead className="hidden sm:table-cell">New trades</TableHead>
                <TableHead className="text-right">Trades</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {tags.map((t) => (
                <TableRow key={t.id}>
                  <TableCell>
                    <span className="flex items-center gap-2">
                      <ColorDot color={t.color ?? TAG_COLORS[t.kind]} />
                      <span className="font-medium">{t.name}</span>
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className={t.kind === "POSITIVE" ? "text-profit" : t.kind === "MISTAKE" ? "text-loss" : "text-muted-foreground"}>{TAG_KIND_LABEL[t.kind]}</span>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">{t.isDefault ? <Badge variant="secondary">On by default</Badge> : <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell className="text-right tabular">{t.trades}</TableCell>
                  <TableCell>
                    <div className="flex justify-end">
                      <EditButton label={t.name} onClick={() => open(t)} />
                      <ConfirmDelete
                        title={t.name}
                        pending={pending}
                        description={<p>{t.trades > 0 ? `The tag will be removed from ${plural(t.trades, "trade")}, and tag-based insights will no longer include it.` : "No trades use this tag."}</p>}
                        onConfirm={() => run(deleteTag, { id: t.id }, { success: `${t.name} deleted`, onSuccess: refresh })}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <p className="text-xs text-muted-foreground">Mistake tags feed the behaviour insights (e.g. the cost of FOMO trades); positive tags measure what working to plan is worth.</p>

      {draft && (
        <EditDialog
          open
          onOpenChange={(v) => !v && setDraft(null)}
          title={draft.id ? `Edit ${draft.name || "tag"}` : "Add tag"}
          pending={pending}
          onSubmit={() =>
            run(saveTag, draft, {
              success: draft.id ? "Tag saved" : "Tag added",
              onSuccess: () => {
                setDraft(null);
                refresh();
              },
            })
          }
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="tag-name" label="Name" hint="Must be unique." error={errors.name}>
              <Input id="tag-name" value={draft.name} maxLength={40} required onChange={(e) => setDraft({ ...draft, name: e.target.value })} {...describedBy("tag-name", errors.name)} />
            </Field>
            <Field id="tag-kind" label="Kind" error={errors.kind}>
              <Select value={draft.kind} onValueChange={(v) => setDraft({ ...draft, kind: v as TagKind })}>
                <SelectTrigger id="tag-kind" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(TAG_KIND_LABEL) as TagKind[]).map((k) => (
                    <SelectItem key={k} value={k}>
                      {TAG_KIND_LABEL[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <ColorField id="tag-color" value={draft.color} fallback={TAG_COLORS[draft.kind]} onChange={(color) => setDraft({ ...draft, color })} error={errors.color} />
          <div className="flex items-center gap-2">
            <Switch id="tag-default" checked={draft.isDefault} onCheckedChange={(isDefault) => setDraft({ ...draft, isDefault })} />
            <Label htmlFor="tag-default">Pre-select on new trades</Label>
          </div>
        </EditDialog>
      )}
    </div>
  );
}

type CategoryKind = SettingsCategoryKind;

/** One option list (e.g. Setups): inline add, rename and delete. */
export function CategoryList({ kind, label, items }: { kind: CategoryKind; label: string; items: CategoryRow[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const { run, pending, errors } = useAction();
  const refresh = () => router.refresh();
  const addId = `cat-${kind}-new`;

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-3">
      <h3 className="text-sm font-semibold">
        {label} <span className="font-normal text-muted-foreground">({items.length})</span>
      </h3>
      <ul className="flex flex-col divide-y">
        {items.map((c) => (
          <li key={c.id} className="flex items-center gap-2 py-1">
            {editing?.id === c.id ? (
              <form
                className="flex flex-1 items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  run(saveCategory, { id: c.id, kind, name: editing.name }, { success: "Option renamed", onSuccess: () => { setEditing(null); refresh(); } });
                }}
              >
                <Label htmlFor={`cat-${c.id}`} className="sr-only">
                  Rename {c.name}
                </Label>
                <Input id={`cat-${c.id}`} autoFocus value={editing.name} maxLength={60} className="h-7" onChange={(e) => setEditing({ id: c.id, name: e.target.value })} />
                <Button type="submit" size="sm" disabled={pending}>
                  Save
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(null)}>
                  Cancel
                </Button>
              </form>
            ) : (
              <>
                <span className="flex-1 truncate text-sm">{c.name}</span>
                {c.trades > 0 && <span className="text-xs text-muted-foreground tabular">{plural(c.trades, "trade")}</span>}
                <EditButton label={c.name} onClick={() => setEditing({ id: c.id, name: c.name })} />
                <ConfirmDelete
                  title={c.name}
                  pending={pending}
                  description={
                    <p>
                      {c.trades > 0
                        ? `It will be removed from the ${label.toLowerCase()} picker. The ${plural(c.trades, "trade")} that use it keep "${c.name}" as text.`
                        : `It will be removed from the ${label.toLowerCase()} picker. No trades use it.`}
                    </p>
                  }
                  onConfirm={() => run(deleteCategory, { id: c.id }, { success: `${c.name} deleted`, onSuccess: refresh })}
                />
              </>
            )}
          </li>
        ))}
        {items.length === 0 && <li className="py-1 text-sm text-muted-foreground">No options yet.</li>}
      </ul>
      <form
        className="flex items-start gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          run(saveCategory, { kind, name }, { success: `Added to ${label.toLowerCase()}`, onSuccess: () => { setName(""); refresh(); } });
        }}
      >
        <div className="flex flex-1 flex-col gap-1">
          <Label htmlFor={addId} className="sr-only">
            New {label.toLowerCase()} option
          </Label>
          <Input id={addId} value={name} maxLength={60} placeholder="Add option…" className="h-8" onChange={(e) => setName(e.target.value)} {...describedBy(addId, editing ? undefined : errors.name)} />
          {!editing && errors.name?.length ? (
            <p id={`${addId}-error`} className="text-xs text-destructive" role="alert">
              {errors.name[0]}
            </p>
          ) : null}
        </div>
        <Button type="submit" variant="outline" size="icon" aria-label={`Add ${label.toLowerCase()} option`} disabled={pending || !name.trim()}>
          <Plus />
        </Button>
      </form>
    </div>
  );
}
