"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, ImagePlus, PenLine, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { deleteScreenshot, updateScreenshot } from "@/server/actions/screenshots";
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
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Annotator } from "./annotator";
import { PHASES, PHASE_LABEL, type Phase } from "./labels";

export interface Shot {
  id: string;
  phase: Phase;
  caption: string | null;
  size: number;
  mimeType: string;
  createdAt: string;
}

const MAX_BYTES = 8 * 1024 * 1024;
const ACCEPT = "image/png,image/jpeg,image/webp,image/gif";
const srcOf = (id: string) => `/api/screenshots/${id}`;

async function uploadFile(tradeId: string, phase: Phase, file: Blob, caption: string, filename = "screenshot.png") {
  const fd = new FormData();
  fd.set("tradeId", tradeId);
  fd.set("phase", phase);
  if (caption.trim()) fd.set("caption", caption.trim());
  fd.set("file", file, filename);
  const res = await fetch("/api/screenshots", { method: "POST", body: fd });
  const body = (await res.json().catch(() => null)) as { ok: boolean; error?: string } | null;
  if (!res.ok || !body?.ok) throw new Error(body?.error ?? `Upload failed (${res.status})`);
}

function Uploader({ tradeId, phase, onUploaded }: { tradeId: string; phase: Phase; onUploaded: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);

  const upload = async (files: File[]) => {
    const images = files.filter((f) => f.size > 0);
    if (!images.length) return;
    setBusy(true);
    let ok = 0;
    for (const f of images) {
      if (f.size > MAX_BYTES) {
        toast.error(`${f.name} is larger than 8 MB`);
        continue;
      }
      try {
        await uploadFile(tradeId, phase, f, caption, f.name);
        ok++;
      } catch (e) {
        toast.error(`${f.name}: ${(e as Error).message}`);
      }
    }
    setBusy(false);
    if (ok) {
      toast.success(`${ok} screenshot${ok === 1 ? "" : "s"} uploaded`);
      setCaption("");
      onUploaded();
    }
    if (inputRef.current) inputRef.current.value = "";
  };

  const id = `shot-${phase}`;
  return (
    <div
      className={cn("grid gap-2 rounded-md border border-dashed p-3 transition-colors", drag && "border-primary bg-primary/5")}
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        void upload([...e.dataTransfer.files]);
      }}
      onPaste={(e) => {
        const files = [...e.clipboardData.files];
        if (files.length) {
          e.preventDefault();
          void upload(files);
        }
      }}
    >
      <div className="grid gap-1">
        <Label htmlFor={`${id}-caption`} className="text-xs">
          Caption (optional)
        </Label>
        <Input id={`${id}-caption`} value={caption} maxLength={300} onChange={(e) => setCaption(e.target.value)} className="h-7" placeholder="e.g. 15m entry trigger" />
      </div>
      <input ref={inputRef} id={`${id}-file`} type="file" accept={ACCEPT} multiple className="sr-only" tabIndex={-1} aria-label={`Choose ${PHASE_LABEL[phase].toLowerCase()} screenshot files`} onChange={(e) => void upload([...(e.target.files ?? [])])} />
      <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => inputRef.current?.click()}>
        <Upload /> {busy ? "Uploading…" : `Add ${PHASE_LABEL[phase].toLowerCase()} screenshot`}
      </Button>
      <p className="text-[11px] text-muted-foreground">PNG, JPEG, WebP or GIF up to 8 MB. Drop or paste here.</p>
    </div>
  );
}

export function ScreenshotGallery({ tradeId, screenshots, timezone }: { tradeId: string; screenshots: Shot[]; timezone: string }) {
  const router = useRouter();
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [annotating, setAnnotating] = useState(false);
  const [savingAnnotation, setSavingAnnotation] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Shot | null>(null);
  const [captionDraft, setCaptionDraft] = useState("");
  const [pending, start] = useTransition();

  const ordered = PHASES.flatMap((p) => screenshots.filter((s) => s.phase === p));
  const open = openIndex !== null ? ordered[openIndex] : null;
  const refresh = () => router.refresh();

  const show = (i: number) => {
    const s = ordered[i];
    if (!s) return;
    setOpenIndex(i);
    setCaptionDraft(s.caption ?? "");
    setAnnotating(false);
  };

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 lg:grid-cols-3">
        {PHASES.map((phase) => {
          const list = ordered.map((s, i) => ({ s, i })).filter((x) => x.s.phase === phase);
          return (
            <div key={phase} className="grid content-start gap-2">
              <h3 className="text-sm font-semibold">
                {PHASE_LABEL[phase]} <span className="font-normal text-muted-foreground">· {list.length}</span>
              </h3>
              {list.length > 0 && (
                <ul className="grid grid-cols-2 gap-2">
                  {list.map(({ s, i }) => (
                    <li key={s.id}>
                      <button type="button" onClick={() => show(i)} className="group block w-full overflow-hidden rounded-md border bg-muted/30 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50" aria-label={`View ${PHASE_LABEL[phase].toLowerCase()} screenshot${s.caption ? `: ${s.caption}` : ""}`}>
                        {/* eslint-disable-next-line @next/next/no-img-element -- authorised stream, not optimisable by next/image */}
                        <img src={srcOf(s.id)} alt={s.caption ?? `${PHASE_LABEL[phase]} screenshot`} loading="lazy" className="aspect-video w-full object-cover transition-transform group-hover:scale-[1.02]" />
                        {s.caption && <span className="block truncate px-2 py-1 text-xs text-muted-foreground">{s.caption}</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <Uploader tradeId={tradeId} phase={phase} onUploaded={refresh} />
            </div>
          );
        })}
      </div>
      {!screenshots.length && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <ImagePlus className="size-4" /> No screenshots yet. Chart screenshots before, during and after the trade make reviews far more useful.
        </p>
      )}

      <Dialog open={!!open} onOpenChange={(o) => !o && setOpenIndex(null)}>
        <DialogContent
          className="max-h-[95vh] overflow-y-auto sm:max-w-5xl"
          onKeyDown={(e) => {
            if (annotating || openIndex === null || (e.target as HTMLElement).tagName === "INPUT") return;
            if (e.key === "ArrowRight") show((openIndex + 1) % ordered.length);
            if (e.key === "ArrowLeft") show((openIndex - 1 + ordered.length) % ordered.length);
          }}
        >
          {open && (
            <>
              <DialogTitle>
                {PHASE_LABEL[open.phase]} screenshot {ordered.length > 1 && <span className="font-normal text-muted-foreground">· {(openIndex ?? 0) + 1} of {ordered.length}</span>}
              </DialogTitle>
              <DialogDescription className="sr-only">Screenshot viewer. Use the left and right arrow keys to move between screenshots.</DialogDescription>
              {annotating ? (
                <Annotator
                  src={srcOf(open.id)}
                  saving={savingAnnotation}
                  onCancel={() => setAnnotating(false)}
                  onSave={async (blob) => {
                    setSavingAnnotation(true);
                    try {
                      await uploadFile(tradeId, open.phase, blob, `Annotated${open.caption ? `: ${open.caption}` : ""}`.slice(0, 300), blob.type === "image/webp" ? "annotated.webp" : "annotated.png");
                      toast.success("Annotated copy saved");
                      setAnnotating(false);
                      setOpenIndex(null);
                      refresh();
                    } catch (e) {
                      toast.error((e as Error).message);
                    } finally {
                      setSavingAnnotation(false);
                    }
                  }}
                />
              ) : (
                <>
                  <div className="relative flex items-center justify-center rounded-md bg-muted/30">
                    {/* eslint-disable-next-line @next/next/no-img-element -- authorised stream */}
                    <img src={srcOf(open.id)} alt={open.caption ?? `${PHASE_LABEL[open.phase]} screenshot`} className="max-h-[65vh] w-auto max-w-full object-contain" />
                    {ordered.length > 1 && (
                      <>
                        <Button type="button" size="icon" variant="secondary" className="absolute top-1/2 left-2 -translate-y-1/2" onClick={() => show(((openIndex ?? 0) - 1 + ordered.length) % ordered.length)} aria-label="Previous screenshot">
                          <ChevronLeft />
                        </Button>
                        <Button type="button" size="icon" variant="secondary" className="absolute top-1/2 right-2 -translate-y-1/2" onClick={() => show(((openIndex ?? 0) + 1) % ordered.length)} aria-label="Next screenshot">
                          <ChevronRight />
                        </Button>
                      </>
                    )}
                  </div>
                  <form
                    className="flex flex-wrap items-end gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      start(async () => {
                        const res = await updateScreenshot({ id: open.id, caption: captionDraft });
                        if (!res.ok) return void toast.error(res.error);
                        toast.success("Caption saved");
                        refresh();
                      });
                    }}
                  >
                    <div className="grid min-w-48 flex-1 gap-1">
                      <Label htmlFor="shot-caption-edit" className="text-xs">
                        Caption
                      </Label>
                      <Input id="shot-caption-edit" value={captionDraft} maxLength={300} onChange={(e) => setCaptionDraft(e.target.value)} />
                    </div>
                    <Button type="submit" variant="outline" disabled={pending || captionDraft === (open.caption ?? "")}>
                      Save caption
                    </Button>
                    <Button type="button" variant="outline" onClick={() => setAnnotating(true)}>
                      <PenLine /> Annotate
                    </Button>
                    <Button type="button" variant="destructive" onClick={() => setConfirmDelete(open)}>
                      <Trash2 /> Delete
                    </Button>
                  </form>
                  <p className="text-[11px] text-muted-foreground">
                    {(open.size / 1024 / 1024).toFixed(2)} MB · {open.mimeType.replace("image/", "").toUpperCase()} · uploaded {formatDateTime(open.createdAt, timezone)}
                  </p>
                </>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete screenshot?</AlertDialogTitle>
            <AlertDialogDescription>The image file is removed permanently.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={pending}
              onClick={(e) => {
                e.preventDefault();
                const target = confirmDelete;
                if (!target) return;
                start(async () => {
                  const res = await deleteScreenshot({ id: target.id });
                  if (!res.ok) return void toast.error(res.error);
                  toast.success("Screenshot deleted");
                  setConfirmDelete(null);
                  setOpenIndex(null);
                  refresh();
                });
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
