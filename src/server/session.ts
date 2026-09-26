import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./auth";

/** The signed-in user for this request, or a redirect to /login. Every page and action calls this. */
export const requireUser = cache(async () => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");
  return session.user;
});

export async function getOptionalUser() {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user ?? null;
}
