"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { id } from "@/lib/validation/common";
import { payoutSchema, payoutTransitionSchema, updatePayoutSchema } from "@/lib/validation/payout";
import { createAction } from "../action";
import { createPayoutForUser, deletePayoutForUser, transitionPayoutForUser, updatePayoutForUser } from "../services/payouts";

function revalidate(accountId?: string) {
  revalidatePath("/", "layout");
  if (accountId) revalidatePath(`/accounts/${accountId}`);
}

export const createPayout = createAction(payoutSchema, async (input, user) => {
  const r = await createPayoutForUser(user.id, input);
  revalidate(input.accountId);
  return r;
});

export const updatePayout = createAction(updatePayoutSchema, async (input, user) => {
  const r = await updatePayoutForUser(user.id, input);
  revalidate(input.accountId);
  return r;
});

export const deletePayout = createAction(z.object({ id }), async ({ id }, user) => {
  const r = await deletePayoutForUser(user.id, id);
  revalidate(r.accountId);
  return undefined;
});

export const transitionPayout = createAction(payoutTransitionSchema, async (input, user) => {
  const r = await transitionPayoutForUser(user.id, input);
  revalidate();
  return r;
});
