import { toast } from "sonner";

/** Client-side helpers shared by the account forms. */

const pad = (n: number) => String(n).padStart(2, "0");

/** Today as YYYY-MM-DD in the browser's local time. */
export function todayInput(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Now as YYYY-MM-DDTHH:mm (datetime-local) in the browser's local time. */
export function nowInput(): string {
  const d = new Date();
  return `${todayInput()}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** ISO string → YYYY-MM-DD in local time ("" for null). */
export function isoToDateInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Date input → ISO at local noon (so the calendar day survives timezone display), null when blank. */
export function dateInputToIso(v: string): string | null {
  if (!v) return null;
  const d = new Date(`${v}T12:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** datetime-local input → ISO, null when blank. */
export function dateTimeInputToIso(v: string): string | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export type FieldErrors = Record<string, string[]>;

type Result<T> = { ok: true; data: T } | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

/** Toast an action failure and return its field errors; returns null on success. */
export function handleResult<T>(r: Result<T>, success?: string): { ok: true; data: T } | { ok: false; fieldErrors: FieldErrors } {
  if (r.ok) {
    if (success) toast.success(success);
    return r;
  }
  toast.error(r.error);
  return { ok: false, fieldErrors: r.fieldErrors ?? {} };
}

export function FieldError({ errors, id }: { errors?: string[]; id?: string }) {
  if (!errors?.length) return null;
  return (
    <p id={id} className="text-xs text-destructive">
      {errors[0]}
    </p>
  );
}
