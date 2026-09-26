"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { id } from "@/lib/validation/common";
import { tradingRuleSchema, updateTradingRuleSchema } from "@/lib/validation/rule";
import { createAction } from "../action";
import { createTradingRuleForUser, deleteTradingRuleForUser, setTradingRuleFlagsForUser, updateTradingRuleForUser } from "../services/trading-rules";

export const createTradingRule = createAction(tradingRuleSchema, async (input, user) => {
  const r = await createTradingRuleForUser(user.id, input);
  revalidatePath("/", "layout");
  return r;
});

export const updateTradingRule = createAction(updateTradingRuleSchema, async (input, user) => {
  const r = await updateTradingRuleForUser(user.id, input);
  revalidatePath("/", "layout");
  return r;
});

export const setTradingRuleFlags = createAction(
  z.object({ id, isActive: z.boolean().optional(), hardLimit: z.boolean().optional() }),
  async (input, user) => {
    const r = await setTradingRuleFlagsForUser(user.id, input);
    revalidatePath("/", "layout");
    return r;
  },
);

export const deleteTradingRule = createAction(z.object({ id }), async ({ id }, user) => {
  await deleteTradingRuleForUser(user.id, id);
  revalidatePath("/", "layout");
  return undefined;
});
