import "server-only";
import { auth } from "../auth";
import { RateLimitError, enforceRateLimit } from "../rate-limit";

/** Shared plumbing for the /api/export route handlers: auth, rate limit, attachment responses. */

export type ExportUser = { id: string; name: string; email: string };

/**
 * Resolve the session from the request headers and apply the export rate limit.
 * Returns the user, or a ready-made 401/429 response.
 */
export async function authorizeExport(req: Request): Promise<{ user: ExportUser } | { response: Response }> {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return { response: Response.json({ error: "Not signed in" }, { status: 401 }) };
  try {
    await enforceRateLimit(`export:${session.user.id}`, { window: 60, max: 20 });
  } catch (e) {
    if (e instanceof RateLimitError) {
      return { response: Response.json({ error: e.message }, { status: 429, headers: { "Retry-After": String(e.retryAfter ?? 60) } }) };
    }
    throw e;
  }
  return { user: { id: session.user.id, name: session.user.name, email: session.user.email } };
}

export function attachment(body: BodyInit, filename: string, contentType: string): Response {
  const safe = filename.replace(/[^A-Za-z0-9._-]/g, "_");
  return new Response(body, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${safe}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export function exportError(e: unknown, what: string): Response {
  console.error(`[export:${what}]`, e);
  return Response.json({ error: `Could not generate the ${what}. Please try again.` }, { status: 500 });
}

export const MIME = {
  csv: "text/csv; charset=utf-8",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pdf: "application/pdf",
} as const;

/** Today's date (YYYY-MM-DD) for filenames. */
export function stamp(): string {
  return new Date().toISOString().slice(0, 10);
}
