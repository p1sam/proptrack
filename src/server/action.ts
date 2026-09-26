import "server-only";
import { z } from "zod";
import { requireUser } from "./session";
import { RateLimitError } from "./rate-limit";

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

/** An error whose message is safe to show to the user. */
export class UserError extends Error {}

type SessionUser = Awaited<ReturnType<typeof requireUser>>;

/**
 * Wrap a server action: authenticate, validate input with zod, and turn failures into a
 * serialisable result. Unexpected errors are logged server-side and reported generically.
 */
export function createAction<S extends z.ZodType, T>(schema: S, handler: (input: z.infer<S>, user: SessionUser) => Promise<T>) {
  return async (raw: z.input<S>): Promise<ActionResult<T>> => {
    const user = await requireUser();
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path.join(".") || "_";
        (fieldErrors[key] ??= []).push(issue.message);
      }
      const first = parsed.error.issues[0];
      return { ok: false, error: first ? `${first.path.join(".") || "Input"}: ${first.message}` : "Invalid input", fieldErrors };
    }
    try {
      return { ok: true, data: await handler(parsed.data, user) };
    } catch (e) {
      if (e instanceof UserError || e instanceof RateLimitError) return { ok: false, error: e.message };
      // Next.js redirects/notFound are thrown errors that must propagate.
      if (e && typeof e === "object" && "digest" in e) throw e;
      console.error("[action]", e);
      return { ok: false, error: "Something went wrong. Please try again." };
    }
  };
}
