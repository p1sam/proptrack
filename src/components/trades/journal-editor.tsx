"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { saveTradeJournal } from "@/server/actions/trades";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { EmotionRatings, JournalTextSections } from "./journal-fields";
import { journalToInput, type JournalValues } from "./journal-values";
import { TagPicker, type TagOption } from "./tag-picker";

type SaveState = "saved" | "dirty" | "saving" | "error";

interface Draft {
  journal: JournalValues;
  tagIds: string[];
  notes: string;
}

const AUTOSAVE_MS = 1500;

/**
 * Journal, psychology, tags and notes for one trade, autosaved (debounced) through
 * saveTradeJournal. Changes made while a save is in flight are saved right after it.
 */
export function JournalEditor({ tradeId, initial, tags }: { tradeId: string; initial: Draft; tags: TagOption[] }) {
  const [draft, setDraft] = useState<Draft>(initial);
  const [state, setState] = useState<SaveState>("saved");
  const [error, setError] = useState<string | null>(null);
  const latest = useRef(draft);
  const version = useRef(0);
  const savedVersion = useRef(0);
  const inFlight = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveRef = useRef<() => Promise<void>>(async () => {});
  const isDirty = useCallback(() => savedVersion.current !== version.current, []);

  const save = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    if (inFlight.current) return;
    if (savedVersion.current === version.current) return;
    inFlight.current = true;
    const v = version.current;
    const d = latest.current;
    setState("saving");
    const res = await saveTradeJournal({ tradeId, journal: journalToInput(d.journal), tagIds: d.tagIds, notes: d.notes });
    inFlight.current = false;
    if (!res.ok) {
      setState("error");
      setError(res.error);
      toast.error(`Journal not saved: ${res.error}`);
      return;
    }
    savedVersion.current = v;
    setError(null);
    if (version.current !== v) {
      setState("dirty");
      timer.current = setTimeout(() => void saveRef.current(), AUTOSAVE_MS);
    } else setState("saved");
  }, [tradeId]);

  useEffect(() => {
    saveRef.current = save;
  }, [save]);

  const update = (next: Draft) => {
    setDraft(next);
    latest.current = next;
    version.current++;
    setState("dirty");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(), AUTOSAVE_MS);
  };

  // Warn before leaving with unsaved changes; flush on unmount.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty()) e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      if (timer.current) clearTimeout(timer.current);
      if (isDirty()) void save();
    };
  }, [save, isDirty]);

  const status =
    state === "saving" ? (
      <span className="inline-flex items-center gap-1 text-muted-foreground">
        <Loader2 className="size-3 animate-spin" /> Saving…
      </span>
    ) : state === "saved" ? (
      <span className="inline-flex items-center gap-1 text-muted-foreground">
        <Check className="size-3" /> All changes saved
      </span>
    ) : state === "error" ? (
      <span className="text-destructive">Not saved{error ? ` — ${error}` : ""}</span>
    ) : (
      <span className="text-muted-foreground">Unsaved changes</span>
    );

  return (
    <div
      className="grid gap-4"
      onKeyDown={(e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === "s") {
          e.preventDefault();
          void save();
        }
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs" role="status" aria-live="polite">
          {status}
        </p>
        <Button size="sm" variant="outline" onClick={() => void save()} disabled={state === "saved" || state === "saving"}>
          Save now
        </Button>
      </div>
      <Tabs defaultValue="journal">
        <TabsList>
          <TabsTrigger value="journal">Journal</TabsTrigger>
          <TabsTrigger value="psychology">Psychology</TabsTrigger>
          <TabsTrigger value="tags">Tags &amp; notes</TabsTrigger>
        </TabsList>
        <TabsContent value="journal" className="pt-3">
          <JournalTextSections value={draft.journal} onChange={(p) => update({ ...draft, journal: { ...draft.journal, ...p } })} idPrefix="j" />
        </TabsContent>
        <TabsContent value="psychology" className="pt-3">
          <p className="mb-3 text-xs text-muted-foreground">Rate each from 1 (very low) to 5 (very high). Leave unrated if it did not apply.</p>
          <EmotionRatings values={draft.journal} onChange={(emo, val) => update({ ...draft, journal: { ...draft.journal, [emo]: val } })} idPrefix="j-emo" />
        </TabsContent>
        <TabsContent value="tags" className="grid gap-4 pt-3">
          <div className="grid gap-2">
            <h3 className="text-sm font-semibold">Tags</h3>
            <TagPicker tags={tags} value={draft.tagIds} onChange={(ids) => update({ ...draft, tagIds: ids })} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="j-notes">Notes</Label>
            <Textarea id="j-notes" rows={5} maxLength={10000} value={draft.notes} onChange={(e) => update({ ...draft, notes: e.target.value })} />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
