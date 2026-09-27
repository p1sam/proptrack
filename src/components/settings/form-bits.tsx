"use client";

import { useState, useTransition } from "react";
import { Loader2, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { ActionResult } from "@/server/action";
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
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export type FieldErrors = Record<string, string[] | undefined>;

/**
 * Run a server action with pending state, toasts and field errors. Actions revalidate the
 * layout themselves, so the page re-renders with fresh data when they succeed.
 */
export function useAction() {
  const [pending, start] = useTransition();
  const [errors, setErrors] = useState<FieldErrors>({});
  function run<I, T>(action: (input: I) => Promise<ActionResult<T>>, input: I, opts: { success?: string | ((data: T) => string); onSuccess?: (data: T) => void } = {}) {
    start(async () => {
      const r = await action(input);
      if (r.ok) {
        setErrors({});
        const msg = typeof opts.success === "function" ? opts.success(r.data) : opts.success;
        if (msg) toast.success(msg);
        opts.onSuccess?.(r.data);
      } else {
        setErrors(r.fieldErrors ?? {});
        toast.error(r.error);
      }
    });
  }
  return { run, pending, errors, setErrors };
}

export function Field({
  id,
  label,
  hint,
  error,
  children,
  className,
}: {
  id: string;
  label: React.ReactNode;
  hint?: React.ReactNode;
  error?: string[];
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error?.length ? (
        <p id={`${id}-error`} className="text-xs text-destructive" role="alert">
          {error[0]}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** aria props wiring an input to its Field's error/hint text. */
export function describedBy(id: string, error?: string[]) {
  return { "aria-invalid": error?.length ? true : undefined, "aria-describedby": error?.length ? `${id}-error` : `${id}-hint` };
}

export function SubmitButton({ pending, children, className }: { pending: boolean; children: React.ReactNode; className?: string }) {
  return (
    <Button type="submit" disabled={pending} className={className}>
      {pending && <Loader2 className="animate-spin" />}
      {children}
    </Button>
  );
}

/** Delete with a confirmation dialog that explains the effect on existing data. */
export function ConfirmDelete({ title, description, onConfirm, pending, label = "Delete" }: { title: string; description: React.ReactNode; onConfirm: () => void; pending?: boolean; label?: string }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="ghost" size="icon-sm" aria-label={`${label} ${title}`} disabled={pending}>
          <Trash2 />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{`${label} ${title}?`}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="flex flex-col gap-2">{description}</div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onConfirm}>
            {label}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export { plural } from "./logic";

export function ColorDot({ color, className }: { color: string | null | undefined; className?: string }) {
  return <span aria-hidden className={cn("inline-block size-2.5 shrink-0 rounded-full border", className)} style={color ? { backgroundColor: color, borderColor: color } : undefined} />;
}

/** Add/edit dialog wrapping a form. The caller owns the field state and submit handler. */
export function EditDialog({
  open,
  onOpenChange,
  title,
  description,
  onSubmit,
  pending,
  submitLabel = "Save",
  children,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description?: React.ReactNode;
  onSubmit: () => void;
  pending: boolean;
  submitLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}
        >
          {children}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <SubmitButton pending={pending}>{submitLabel}</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Optional colour: a native colour picker plus a "none" toggle. Stored values are user data. */
export function ColorField({ id, value, onChange, fallback, error }: { id: string; value: string | null; onChange: (v: string | null) => void; fallback: string; error?: string[] }) {
  return (
    <Field id={id} label="Colour" hint={value ? undefined : "No colour — a theme colour is used."} error={error}>
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="color"
          value={value ?? fallback}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 w-12 cursor-pointer rounded-md border bg-transparent p-0.5"
          {...describedBy(id, error)}
        />
        <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)} disabled={!value}>
          No colour
        </Button>
      </div>
    </Field>
  );
}

/** Small row of edit/delete controls for a table row. */
export function EditButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button type="button" variant="ghost" size="icon-sm" aria-label={`Edit ${label}`} onClick={onClick}>
      <Pencil />
    </Button>
  );
}
