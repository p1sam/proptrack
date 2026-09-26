import type { NextRequest } from "next/server";
import { auth } from "@/server/auth";
import { prisma } from "@/server/db";
import { getStorage } from "@/server/storage";

const ALLOWED = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

/** Stream a screenshot to its owner. Everyone else gets 404 (existence is not revealed). */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/screenshots/[id]">) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return new Response("Unauthorized", { status: 401 });
  const { id } = await ctx.params;
  const shot = await prisma.tradeScreenshot.findFirst({ where: { id, userId: session.user.id }, select: { storageKey: true, mimeType: true } });
  if (!shot || !ALLOWED.has(shot.mimeType)) return new Response("Not found", { status: 404 });
  const obj = await getStorage().get(shot.storageKey);
  if (!obj) return new Response("Not found", { status: 404 });
  return new Response(obj.stream, {
    headers: {
      "Content-Type": shot.mimeType,
      "Content-Length": String(obj.size),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=3600",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
      "Content-Disposition": "inline",
      "Cross-Origin-Resource-Policy": "same-origin",
    },
  });
}
