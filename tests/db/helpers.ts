import { revalidatePath } from "next/cache";
import { expect, vi } from "vitest";
import { db } from "@/lib/db";
import type { CategoryType, Direction } from "@/lib/generated/prisma/client";

export { db };

export async function resetDb() {
  await db.transaction.deleteMany();
  await db.importBatch.deleteMany();
  await db.statementTemplate.deleteMany();
  await db.category.deleteMany();
  await db.categoryGroup.deleteMany();
}

export async function makeGroup(name: string) {
  return db.categoryGroup.create({ data: { name } });
}

export async function makeCategory(name: string, type: CategoryType, groupId: number) {
  return db.category.create({ data: { name, type, groupId } });
}

export async function makeTransaction(data: {
  date: string;
  description: string;
  amountCents: number;
  direction: Direction;
  categoryId: number;
  importBatchId?: number;
}) {
  const { date, ...rest } = data;
  return db.transaction.create({ data: { ...rest, date: new Date(`${date}T00:00:00.000Z`) } });
}

/** A small fixture: two groups, three categories. */
export async function seedBasics() {
  const income = await makeGroup("Income");
  const food = await makeGroup("Food");
  const salary = await makeCategory("Salary", "CREDIT", income.id);
  const groceries = await makeCategory("Groceries", "DEBIT", food.id);
  const dining = await makeCategory("Dining Out", "DEBIT", food.id);
  return { income, food, salary, groceries, dining };
}

export function expectRevalidated() {
  expect(vi.mocked(revalidatePath)).toHaveBeenCalledWith("/", "layout");
}

export function expectNotRevalidated() {
  expect(vi.mocked(revalidatePath)).not.toHaveBeenCalled();
}
