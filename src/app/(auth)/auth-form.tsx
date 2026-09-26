"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/app/logo";

/** Only allow same-origin relative redirects ("/x", not "//evil.com"). */
function safeNext(next: string | null) {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/";
}

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email") ?? "").trim();
    const password = String(fd.get("password") ?? "");
    setPending(true);
    const res =
      mode === "login"
        ? await authClient.signIn.email({ email, password })
        : await authClient.signUp.email({ email, password, name: String(fd.get("name") ?? "").trim() || email.split("@")[0] });
    setPending(false);
    if (res.error) {
      setError(res.error.status === 429 ? "Too many attempts. Please wait a minute and try again." : res.error.message ?? "Something went wrong.");
      return;
    }
    if (mode === "register") toast.success("Account created");
    router.push(safeNext(params.get("next")));
    router.refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex justify-center text-lg">
          <Logo />
        </div>
        <div className="rounded-xl border bg-card p-6">
          <h1 className="text-lg font-semibold">{mode === "login" ? "Sign in" : "Create your account"}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode === "login" ? "Track every challenge, funded account and payout." : "Your data is private to your account."}
          </p>
          <form onSubmit={onSubmit} className="mt-5 flex flex-col gap-3">
            {mode === "register" && (
              <div className="grid gap-1.5">
                <Label htmlFor="name">Name</Label>
                <Input id="name" name="name" autoComplete="name" maxLength={80} />
              </div>
            )}
            <div className="grid gap-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" autoComplete="email" required />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="password">Password</Label>
              <Input id="password" name="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} required minLength={mode === "register" ? 10 : undefined} maxLength={128} />
              {mode === "register" && <p className="text-xs text-muted-foreground">At least 10 characters.</p>}
            </div>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={pending} className="mt-1">
              {pending ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
            </Button>
          </form>
        </div>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          {mode === "login" ? (
            <>No account? <Link href="/register" className="text-foreground underline-offset-4 hover:underline">Create one</Link></>
          ) : (
            <>Already registered? <Link href="/login" className="text-foreground underline-offset-4 hover:underline">Sign in</Link></>
          )}
        </p>
      </div>
    </div>
  );
}
