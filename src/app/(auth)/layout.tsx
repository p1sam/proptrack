import { redirect } from "next/navigation";
import { getOptionalUser } from "@/server/session";

/** Signed-in users skip the auth pages; the check uses the real session, not just the cookie. */
export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  if (await getOptionalUser()) redirect("/");
  return children;
}
