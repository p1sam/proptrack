import "server-only";
import { randomUUID } from "node:crypto";
import { prisma } from "./db";

/**
 * Fixed-window rate limiter stored in Postgres, so limits hold across serverless instances.
 * The check and increment happen in one atomic upsert.
 */
export async function consumeRateLimit(key: string, rule: { window: number; max: number }) {
  const now = Date.now();
  const windowMs = rule.window * 1000;
  const rows = await prisma.$queryRaw<{ count: number; lastRequest: bigint }[]>`
    INSERT INTO rate_limits (id, key, count, "lastRequest")
    VALUES (${randomUUID()}, ${key}, 1, ${BigInt(now)})
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN rate_limits."lastRequest" < ${BigInt(now - windowMs)} THEN 1 ELSE rate_limits.count + 1 END,
      "lastRequest" = CASE WHEN rate_limits."lastRequest" < ${BigInt(now - windowMs)} THEN ${BigInt(now)} ELSE rate_limits."lastRequest" END
    RETURNING count, "lastRequest"`;
  const row = rows[0];
  const allowed = row.count <= rule.max;
  return {
    allowed,
    retryAfter: allowed ? null : Math.max(1, Math.ceil((Number(row.lastRequest) + windowMs - now) / 1000)),
  };
}

export class RateLimitError extends Error {
  constructor(public retryAfter: number | null) {
    super(`Too many requests. Try again in ${retryAfter ?? 60} seconds.`);
  }
}

export async function enforceRateLimit(key: string, rule: { window: number; max: number }) {
  const r = await consumeRateLimit(key, rule);
  if (!r.allowed) throw new RateLimitError(r.retryAfter);
}
