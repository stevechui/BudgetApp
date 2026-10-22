"use server";

import { db } from "@/lib/db";
import {
  categorySchema,
  firstError,
  type ActionResult,
  type CategoryInput,
} from "@/lib/validation";
import { handleDbError, revalidateAll } from "./shared";

export async function createCategory(input: CategoryInput): Promise<ActionResult> {
  const parsed = categorySchema.safeParse(input);
  if (!parsed.success) return firstError(parsed.error);
  try {
    await db.category.create({ data: parsed.data });
  } catch (e) {
    return handleDbError(e, "category");
  }
  revalidateAll();
  return { ok: true };
}

export async function updateCategory(id: number, input: CategoryInput): Promise<ActionResult> {
  const parsed = categorySchema.safeParse(input);
  if (!parsed.success) return firstError(parsed.error);
  try {
    await db.category.update({ where: { id }, data: parsed.data });
  } catch (e) {
    return handleDbError(e, "category");
  }
  revalidateAll();
  return { ok: true };
}

/**
 * Deletes a category. If it has transactions, `reassignToId` must be given and
 * those transactions are moved to that category first.
 */
export async function deleteCategory(id: number, reassignToId?: number): Promise<ActionResult> {
  const count = await db.transaction.count({ where: { categoryId: id } });
  if (count > 0 && !reassignToId) {
    return {
      ok: false,
      error: `This category is used by ${count} transaction${count === 1 ? "" : "s"}. Choose a category to move them to.`,
    };
  }
  if (reassignToId === id) {
    return { ok: false, error: "Pick a different category to move transactions to" };
  }
  try {
    await db.$transaction(async (tx) => {
      if (count > 0 && reassignToId) {
        await tx.transaction.updateMany({
          where: { categoryId: id },
          data: { categoryId: reassignToId },
        });
      }
      await tx.category.delete({ where: { id } });
    });
  } catch (e) {
    return handleDbError(e, "category");
  }
  revalidateAll();
  return { ok: true };
}
