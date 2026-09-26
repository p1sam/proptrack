import type { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/server/auth";
import { prisma } from "@/server/db";
import { consumeRateLimit } from "@/server/rate-limit";
import { MAX_SCREENSHOT_BYTES, getStorage, newScreenshotKey, sniffImageType } from "@/server/storage";

/** Multipart overhead allowance on top of the file limit. */
const MAX_BODY_BYTES = MAX_SCREENSHOT_BYTES + 64 * 1024;

const fieldsSchema = z.object({
  tradeId: z.string().min(1).max(64),
  phase: z.enum(["BEFORE", "DURING", "AFTER"]),
  caption: z
    .string()
    .max(300)
    .optional()
    .transform((v) => v?.trim() || null),
});

const error = (status: number, message: string, headers?: HeadersInit) => Response.json({ ok: false, error: message }, { status, headers });

function sameHost(origin: string, host: string | null) {
  try {
    return !!host && new URL(origin).host === host;
  } catch {
    return false;
  }
}

/** Read the request body, aborting as soon as it exceeds `limit` bytes. */
async function readLimited(req: NextRequest, limit: number): Promise<Uint8Array | null> {
  if (!req.body) return new Uint8Array();
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.byteLength;
  }
  return out;
}

/**
 * Upload a trade screenshot (multipart: file, tradeId, phase, caption?).
 * A route handler rather than a server action because server-action bodies are capped at 1 MB.
 */
export async function POST(req: NextRequest) {
  // Same-origin only (session cookies are SameSite=Lax too; this is defence in depth).
  const origin = req.headers.get("origin");
  if (origin && !sameHost(origin, req.headers.get("host"))) return error(403, "Cross-origin upload rejected");

  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return error(401, "Not signed in");
  const userId = session.user.id;

  const rl = await consumeRateLimit(`upload:screenshot:${userId}`, { window: 60, max: 30 });
  if (!rl.allowed) return error(429, `Too many uploads. Try again in ${rl.retryAfter} seconds.`, { "Retry-After": String(rl.retryAfter) });

  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) return error(413, "Image is larger than 8 MB");
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.startsWith("multipart/form-data")) return error(415, "Expected multipart/form-data");

  const body = await readLimited(req, MAX_BODY_BYTES);
  if (!body) return error(413, "Image is larger than 8 MB");
  let form: FormData;
  try {
    form = await new Response(body as BodyInit, { headers: { "content-type": contentType } }).formData();
  } catch {
    return error(400, "Malformed upload");
  }

  const fields = fieldsSchema.safeParse({
    tradeId: form.get("tradeId"),
    phase: form.get("phase"),
    caption: form.get("caption") ?? undefined,
  });
  if (!fields.success) return error(400, fields.error.issues[0]?.message ?? "Invalid upload");
  const file = form.get("file");
  if (!(file instanceof Blob) || file.size === 0) return error(400, "Choose an image to upload");
  if (file.size > MAX_SCREENSHOT_BYTES) return error(413, "Image is larger than 8 MB");

  const trade = await prisma.trade.findFirst({ where: { id: fields.data.tradeId, userId }, select: { id: true } });
  if (!trade) return error(404, "Trade not found");

  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = sniffImageType(bytes);
  if (!mime) return error(415, "Only PNG, JPEG, WebP and GIF images are allowed");

  const key = newScreenshotKey(mime);
  const storage = getStorage();
  await storage.put(key, bytes, mime);
  try {
    const shot = await prisma.tradeScreenshot.create({
      data: { userId, tradeId: trade.id, phase: fields.data.phase, storageKey: key, mimeType: mime, size: bytes.byteLength, caption: fields.data.caption },
      select: { id: true, phase: true, caption: true, size: true, mimeType: true, createdAt: true },
    });
    return Response.json({ ok: true, screenshot: { ...shot, createdAt: shot.createdAt.toISOString() } }, { status: 201 });
  } catch (e) {
    await storage.delete(key).catch(() => {});
    console.error("[screenshot upload]", e);
    return error(500, "Upload failed. Please try again.");
  }
}
