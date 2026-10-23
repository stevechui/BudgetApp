"use server";

import { db } from "@/lib/db";
import {
  accountSchema,
  firstError,
  type AccountInput,
  type ActionResult,
} from "@/lib/validation";
import { handleDbError, revalidateAll } from "./shared";

function toData(input: AccountInput) {
  const parsed = accountSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, result: firstError(parsed.error) };
  const { openingBalance, ...rest } = parsed.data;
  return { ok: true as const, data: { ...rest, openingBalanceCents: openingBalance } };
}

export async function createAccount(input: AccountInput): Promise<ActionResult> {
  const parsed = toData(input);
  if (!parsed.ok) return parsed.result;
  try {
    await db.account.create({ data: parsed.data });
  } catch (e) {
    return handleDbError(e, "account");
  }
  revalidateAll();
  return { ok: true };
}

export async function updateAccount(id: number, input: AccountInput): Promise<ActionResult> {
  const parsed = toData(input);
  if (!parsed.ok) return parsed.result;
  try {
    await db.account.update({ where: { id }, data: parsed.data });
  } catch (e) {
    return handleDbError(e, "account");
  }
  revalidateAll();
  return { ok: true };
}

/**
 * Deletes an account. If it has transactions, `reassignToId` must be given and
 * those transactions are moved to that account first.
 */
export async function deleteAccount(id: number, reassignToId?: number): Promise<ActionResult> {
  const count = await db.transaction.count({ where: { accountId: id } });
  if (count > 0 && !reassignToId) {
    return {
      ok: false,
      error: `This account has ${count} transaction${count === 1 ? "" : "s"}. Choose an account to move them to.`,
    };
  }
  if (reassignToId === id) {
    return { ok: false, error: "Pick a different account to move transactions to" };
  }
  try {
    await db.$transaction(async (tx) => {
      if (count > 0 && reassignToId) {
        await tx.transaction.updateMany({
          where: { accountId: id },
          data: { accountId: reassignToId },
        });
      }
      await tx.account.delete({ where: { id } });
    });
  } catch (e) {
    return handleDbError(e, "account");
  }
  revalidateAll();
  return { ok: true };
}
