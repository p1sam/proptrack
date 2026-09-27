"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveAccountRule } from "@/server/actions/accounts";
import type { RuleDTO } from "@/server/queries/account-detail";
import { Button } from "@/components/ui/button";
import { RuleFields, ruleInputFrom, ruleStateFrom, type RuleFormState } from "./rule-fields";
import { handleResult, type FieldErrors } from "./form-utils";

/** Editable prop rules for one account. Saving rebuilds the account (violations, daily stats). */
export function RuleEditor({ accountId, rule, currency }: { accountId: string; rule: RuleDTO | null; currency: string }) {
  const router = useRouter();
  const [value, setValue] = useState<RuleFormState>(() => ruleStateFrom(rule));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [pending, start] = useTransition();
  const [dirty, setDirty] = useState(false);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = handleResult(await saveAccountRule({ accountId, rule: ruleInputFrom(value) }), "Rules saved — account recalculated");
          if (!r.ok) return setErrors(r.fieldErrors);
          setErrors({});
          setDirty(false);
          router.refresh();
        });
      }}
      className="flex flex-col gap-4"
    >
      <RuleFields
        value={value}
        onChange={(v) => {
          setValue(v);
          setDirty(true);
        }}
        errors={errors}
        errorPrefix="rule."
        idPrefix="edit-rule"
        currency={currency}
      />
      <div className="flex flex-wrap items-center gap-2 border-t pt-3">
        <Button type="submit" disabled={pending || !dirty}>
          {pending ? "Saving…" : "Save rules"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={pending || !dirty}
          onClick={() => {
            setValue(ruleStateFrom(rule));
            setErrors({});
            setDirty(false);
          }}
        >
          Discard changes
        </Button>
        <span className="text-xs text-muted-foreground">{dirty ? "Unsaved changes" : rule ? "Saved" : "No rules saved yet"}</span>
      </div>
    </form>
  );
}
