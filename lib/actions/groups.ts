"use server";

import { db } from "@/lib/db";
import { firstError, groupSchema, type ActionResult, type GroupInput } from "@/lib/validation";
import { handleDbError, revalidateAll } from "./shared";

export async function createGroup(input: GroupInput): Promise<ActionResult> {
  const parsed = groupSchema.safeParse(input);
  if (!parsed.success) return firstError(parsed.error);
  try {
    await db.categoryGroup.create({ data: parsed.data });
  } catch (e) {
    return handleDbError(e, "group");
  }
  revalidateAll();
  return { ok: true };
}

export async function updateGroup(id: number, input: GroupInput): Promise<ActionResult> {
  const parsed = groupSchema.safeParse(input);
  if (!parsed.success) return firstError(parsed.error);
  try {
    await db.categoryGroup.update({ where: { id }, data: parsed.data });
  } catch (e) {
    return handleDbError(e, "group");
  }
  revalidateAll();
  return { ok: true };
}

export async function deleteGroup(id: number): Promise<ActionResult> {
  const count = await db.category.count({ where: { groupId: id } });
  if (count > 0) {
    return {
      ok: false,
      error: `This group still has ${count} ${count === 1 ? "category" : "categories"}. Move or delete them first.`,
    };
  }
  try {
    await db.categoryGroup.delete({ where: { id } });
  } catch (e) {
    return handleDbError(e, "group");
  }
  revalidateAll();
  return { ok: true };
}
