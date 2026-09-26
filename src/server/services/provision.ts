import "server-only";
import { prisma } from "../db";
import { DEFAULT_SESSIONS } from "@/lib/calc/sessions";
import { DEFAULT_CATEGORIES, DEFAULT_INSTRUMENTS, DEFAULT_STRATEGIES, DEFAULT_TAGS, TAG_COLORS } from "@/lib/defaults";
import type { CategoryKind } from "@/generated/prisma/enums";

/** Create the per-user defaults (settings, sessions, tags, categories, instruments, strategies). Idempotent. */
export async function provisionNewUser(userId: string) {
  await prisma.$transaction([
    prisma.userSettings.upsert({ where: { userId }, update: {}, create: { userId } }),
    prisma.tradingSession.createMany({
      data: DEFAULT_SESSIONS.map((s) => ({ userId, ...s })),
      skipDuplicates: true,
    }),
    prisma.tradeTag.createMany({
      data: DEFAULT_TAGS.map((t) => ({ userId, name: t.name, kind: t.kind, color: TAG_COLORS[t.kind] })),
      skipDuplicates: true,
    }),
    prisma.category.createMany({
      data: (Object.entries(DEFAULT_CATEGORIES) as [CategoryKind, string[]][]).flatMap(([kind, names]) => names.map((name) => ({ userId, kind, name }))),
      skipDuplicates: true,
    }),
    prisma.instrument.createMany({
      data: DEFAULT_INSTRUMENTS.map((i) => ({ userId, ...i })),
      skipDuplicates: true,
    }),
    prisma.strategy.createMany({
      data: DEFAULT_STRATEGIES.map((name) => ({ userId, name })),
      skipDuplicates: true,
    }),
  ]);
}
