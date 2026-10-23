import { revalidatePath } from "next/cache";
import { expect, vi } from "vitest";
import { db } from "@/lib/db";
import type { AccountType, CategoryType, Direction } from "@/lib/generated/prisma/client";

export { db };

export async function resetDb() {
  await db.transaction.deleteMany();
  await db.importBatch.deleteMany();
  await db.statementTemplate.deleteMany();
  await db.category.deleteMany();
  await db.categoryGroup.deleteMany();
  await db.account.deleteMany();
}

export async function makeAccount(
  name: string,
  type: AccountType = "CHECKING",
  openingBalanceCents = 0,
) {
  return db.account.create({ data: { name, type, openingBalanceCents } });
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
  /** Defaults to the oldest account */
  accountId?: number;
  importBatchId?: number;
}) {
  const { date, accountId, ...rest } = data;
  return db.transaction.create({
    data: {
      ...rest,
      accountId:
        accountId ?? (await db.account.findFirstOrThrow({ orderBy: { id: "asc" } })).id,
      date: new Date(`${date}T00:00:00.000Z`),
    },
  });
}

/** A small fixture: two groups, three categories, a checking account and a credit card. */
export async function seedBasics() {
  const income = await makeGroup("Income");
  const food = await makeGroup("Food");
  const salary = await makeCategory("Salary", "CREDIT", income.id);
  const groceries = await makeCategory("Groceries", "DEBIT", food.id);
  const dining = await makeCategory("Dining Out", "DEBIT", food.id);
  const checking = await makeAccount("Checking");
  const card = await makeAccount("Visa", "CREDIT_CARD");
  return { income, food, salary, groceries, dining, checking, card };
}

export function expectRevalidated() {
  expect(vi.mocked(revalidatePath)).toHaveBeenCalledWith("/", "layout");
}

export function expectNotRevalidated() {
  expect(vi.mocked(revalidatePath)).not.toHaveBeenCalled();
}
