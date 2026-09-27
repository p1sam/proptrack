"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { changePassword, signOutOtherSessions, updateProfile } from "@/server/actions/settings";
import { describedBy, Field, SubmitButton, useAction } from "./form-bits";

export function ProfileForm({ name, email }: { name: string; email: string }) {
  const [value, setValue] = useState(name);
  const { run, pending, errors } = useAction();
  const router = useRouter();
  return (
    <form
      className="flex max-w-md flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        run(updateProfile, { name: value }, { success: "Name updated", onSuccess: () => router.refresh() });
      }}
    >
      <Field id="profile-name" label="Name" error={errors.name}>
        <Input id="profile-name" value={value} onChange={(e) => setValue(e.target.value)} autoComplete="name" maxLength={80} required {...describedBy("profile-name", errors.name)} />
      </Field>
      <Field id="profile-email" label="Email" hint="Your sign-in email. It can't be changed here.">
        <Input id="profile-email" value={email} readOnly disabled aria-readonly {...describedBy("profile-email")} />
      </Field>
      <div>
        <SubmitButton pending={pending}>Save</SubmitButton>
      </div>
    </form>
  );
}

export function PasswordForm() {
  const empty = { currentPassword: "", newPassword: "", confirmPassword: "" };
  const [v, setV] = useState(empty);
  const { run, pending, errors } = useAction();
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: e.target.value });
  return (
    <form
      className="flex max-w-md flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        run(changePassword, v, { success: "Password changed. Other devices were signed out.", onSuccess: () => setV(empty) });
      }}
    >
      <Field id="pw-current" label="Current password" error={errors.currentPassword}>
        <Input id="pw-current" type="password" autoComplete="current-password" value={v.currentPassword} onChange={set("currentPassword")} required {...describedBy("pw-current", errors.currentPassword)} />
      </Field>
      <Field id="pw-new" label="New password" hint="At least 10 characters." error={errors.newPassword}>
        <Input id="pw-new" type="password" autoComplete="new-password" minLength={10} maxLength={128} value={v.newPassword} onChange={set("newPassword")} required {...describedBy("pw-new", errors.newPassword)} />
      </Field>
      <Field id="pw-confirm" label="Confirm new password" error={errors.confirmPassword}>
        <Input id="pw-confirm" type="password" autoComplete="new-password" value={v.confirmPassword} onChange={set("confirmPassword")} required {...describedBy("pw-confirm", errors.confirmPassword)} />
      </Field>
      <div>
        <SubmitButton pending={pending}>Change password</SubmitButton>
      </div>
    </form>
  );
}

export function OtherSessions({ count }: { count: number }) {
  const { run, pending } = useAction();
  const router = useRouter();
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-muted-foreground">
        {count > 0 ? `You are signed in on ${count} other session${count === 1 ? "" : "s"} (other browsers or devices).` : "This is your only active session."}
      </p>
      <Button
        type="button"
        variant="outline"
        disabled={pending || count === 0}
        onClick={() => run(signOutOtherSessions, {}, { success: (d) => `Signed out ${d.revoked} other session${d.revoked === 1 ? "" : "s"}`, onSuccess: () => router.refresh() })}
      >
        <LogOut /> Sign out other sessions
      </Button>
    </div>
  );
}
