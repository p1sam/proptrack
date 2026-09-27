"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { CURRENCIES } from "@/lib/labels";
import { savePreferences } from "@/server/actions/settings";
import type { UserPrefs } from "@/server/queries/settings";
import { describedBy, Field, plural, SubmitButton, useAction } from "./form-bits";
import { TimezoneSelect } from "./timezone-select";

const str = (n: number | null) => (n === null ? "" : String(n));

export function PreferencesForm({ prefs, zones, accounts, trades }: { prefs: UserPrefs; zones: string[]; accounts: number; trades: number }) {
  const router = useRouter();
  const [v, setV] = useState({
    defaultCurrency: prefs.defaultCurrency,
    timezone: prefs.timezone,
    riskPercent: str(prefs.riskPercent),
    maxTradesPerDay: str(prefs.maxTradesPerDay),
    maxDailyLossPct: str(prefs.maxDailyLossPct),
    defaultRR: str(prefs.defaultRR),
    breakevenTolerance: str(prefs.breakevenTolerance),
    insightMinTrades: str(prefs.insightMinTrades),
  });
  const { run, pending, errors } = useAction();
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: e.target.value });
  const willRebuild = v.timezone !== prefs.timezone || Number(v.breakevenTolerance || 0) !== prefs.breakevenTolerance;

  const num = (k: keyof typeof v, label: string, hint: string, props: React.ComponentProps<typeof Input> = {}) => (
    <Field id={`pref-${k}`} label={label} hint={hint} error={errors[k]}>
      <Input id={`pref-${k}`} inputMode="decimal" value={v[k]} onChange={set(k)} {...props} {...describedBy(`pref-${k}`, errors[k])} />
    </Field>
  );

  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        run(savePreferences, v, {
          success: (d) => (d.rebuilt ? `Preferences saved. Recalculated ${plural(d.accounts, "account")}.` : "Preferences saved"),
          onSuccess: () => router.refresh(),
        });
      }}
    >
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-3 text-sm font-semibold">Currency and time</legend>
        <Field id="pref-defaultCurrency" label="Default currency" hint="Portfolio totals are converted to this currency using your exchange rates." error={errors.defaultCurrency}>
          <Input
            id="pref-defaultCurrency"
            list="pref-currency-list"
            maxLength={3}
            className="uppercase"
            value={v.defaultCurrency}
            onChange={(e) => setV({ ...v, defaultCurrency: e.target.value.toUpperCase() })}
            required
            {...describedBy("pref-defaultCurrency", errors.defaultCurrency)}
          />
          <datalist id="pref-currency-list">
            {CURRENCIES.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
        <Field id="pref-timezone" label="Timezone" hint="Trading days, weekdays, calendars and personal daily limits use this timezone." error={errors.timezone}>
          <TimezoneSelect id="pref-timezone" value={v.timezone} onChange={(timezone) => setV({ ...v, timezone })} zones={zones} invalid={!!errors.timezone?.length} />
        </Field>
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <legend className="mb-3 text-sm font-semibold">Risk defaults and personal limits</legend>
        {num("riskPercent", "Risk per trade (%)", "Planned risk as a % of balance. Used for position-size guidance and risk warnings.", { placeholder: "e.g. 0.5" })}
        {num("maxTradesPerDay", "Max trades per day", "Personal limit. Leave empty for no limit.", { inputMode: "numeric", placeholder: "No limit" })}
        {num("maxDailyLossPct", "Max daily loss (%)", "Personal limit, separate from any prop-firm rule.", { placeholder: "No limit" })}
        {num("defaultRR", "Default R:R", "Pre-fills the planned reward-to-risk on new trades.", { placeholder: "e.g. 2" })}
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <legend className="mb-3 text-sm font-semibold">Statistics</legend>
        {num("breakevenTolerance", "Break-even tolerance", `A trade whose |net P&L| is at or below this amount counts as break-even and is excluded from win rate.`, { placeholder: "0" })}
        {num("insightMinTrades", "Insight minimum trades", "Behavioural insights are only shown when at least this many trades back them.", { inputMode: "numeric" })}
      </fieldset>

      {willRebuild && (
        <Alert>
          <RefreshCw />
          <AlertDescription>
            Changing the timezone or break-even tolerance recalculates {plural(accounts, "account")} and {plural(trades, "trade")} (trading days, weekdays, sessions, daily limits and win/loss classification). This can take a moment.
          </AlertDescription>
        </Alert>
      )}

      <div>
        <SubmitButton pending={pending}>{willRebuild ? "Save and recalculate" : "Save preferences"}</SubmitButton>
      </div>
    </form>
  );
}
