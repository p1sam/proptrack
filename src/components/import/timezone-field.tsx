"use client";

import { useId, useMemo } from "react";
import { COMMON_TIMEZONES, isValidTimeZone } from "@/lib/import/dates";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Free-text IANA timezone input with suggestions and validation. */
export function TimezoneField({ value, onChange, userTimezone }: { value: string; onChange: (tz: string) => void; userTimezone: string }) {
  const id = useId();
  const all = useMemo(() => {
    const common = COMMON_TIMEZONES.map((z) => z.value);
    let rest: string[] = [];
    try {
      rest = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone") ?? [];
    } catch {
      rest = [];
    }
    return { common, rest: rest.filter((z) => !common.includes(z)) };
  }, []);
  const valid = value.trim() !== "" && isValidTimeZone(value.trim());
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>Timezone of the file&apos;s timestamps</Label>
      <Input
        id={id}
        list={`${id}-list`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={!valid}
        aria-describedby={`${id}-help`}
        autoComplete="off"
        spellCheck={false}
        className="w-full sm:w-80"
      />
      <datalist id={`${id}-list`}>
        {COMMON_TIMEZONES.map((z) => (
          <option key={z.value} value={z.value}>
            {z.label}
          </option>
        ))}
        {all.rest.map((z) => (
          <option key={z} value={z} />
        ))}
      </datalist>
      <p id={`${id}-help`} className={valid ? "text-xs text-muted-foreground" : "text-xs text-loss"}>
        {valid ? (
          <>
            Any IANA name, e.g. <code>Europe/Athens</code> (common MetaTrader server time) or <code>America/New_York</code>. Your default is{" "}
            <button type="button" className="underline underline-offset-2 hover:text-foreground" onClick={() => onChange(userTimezone)}>
              {userTimezone}
            </button>
            . Timestamps that carry their own offset (Z, +02:00) keep it.
          </>
        ) : (
          "Unknown timezone — use an IANA name such as Europe/London."
        )}
      </p>
    </div>
  );
}
