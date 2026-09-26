"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { id, optionalText } from "@/lib/validation/common";
import { prisma } from "../db";
import { createAction, UserError } from "../action";
import { getStorage } from "../storage";

// Uploads go through POST /api/screenshots (server-action bodies are capped at 1 MB).

export const deleteScreenshot = createAction(z.object({ id }), async ({ id }, user) => {
  const shot = await prisma.tradeScreenshot.findFirst({ where: { id, userId: user.id }, select: { id: true, tradeId: true, storageKey: true } });
  if (!shot) throw new UserError("Screenshot not found");
  await prisma.tradeScreenshot.delete({ where: { id: shot.id } });
  await getStorage()
    .delete(shot.storageKey)
    .catch((e) => console.error("[screenshot delete]", e));
  revalidatePath(`/trades/${shot.tradeId}`);
  return undefined;
});

export const updateScreenshot = createAction(
  z.object({ id, caption: optionalText(300), phase: z.enum(["BEFORE", "DURING", "AFTER"]).optional() }),
  async ({ id, caption, phase }, user) => {
    const shot = await prisma.tradeScreenshot.findFirst({ where: { id, userId: user.id }, select: { id: true, tradeId: true } });
    if (!shot) throw new UserError("Screenshot not found");
    await prisma.tradeScreenshot.update({ where: { id: shot.id }, data: { caption, ...(phase ? { phase } : {}) } });
    revalidatePath(`/trades/${shot.tradeId}`);
    return undefined;
  },
);
