import { describe, expect, it } from "vitest";
import { createCategory, deleteCategory, updateCategory } from "@/lib/actions/categories";
import { getCategories } from "@/lib/queries";
import {
  db,
  expectNotRevalidated,
  expectRevalidated,
  makeCategory,
  makeTransaction,
  seedBasics,
} from "./helpers";

describe("createCategory", () => {
  it("creates a category with a name, type and group", async () => {
    const { food } = await seedBasics();
    expect(await createCategory({ name: " Coffee ", type: "DEBIT", groupId: food.id })).toEqual({
      ok: true,
    });
    const created = await db.category.findUniqueOrThrow({ where: { name: "Coffee" } });
    expect(created).toMatchObject({ type: "DEBIT", groupId: food.id });
    expectRevalidated();
  });

  it("accepts a group id sent as a string", async () => {
    const { food } = await seedBasics();
    const res = await createCategory({ name: "Snacks", type: "DEBIT", groupId: String(food.id) });
    expect(res).toEqual({ ok: true });
  });

  it("creates transfer categories", async () => {
    const { food } = await seedBasics();
    await createCategory({ name: "Card Payment", type: "TRANSFER", groupId: food.id });
    expect((await db.category.findUniqueOrThrow({ where: { name: "Card Payment" } })).type).toBe(
      "TRANSFER",
    );
  });

  it("rejects an invalid type", async () => {
    const { food } = await seedBasics();
    const res = await createCategory({
      name: "Coffee",
      type: "SAVINGS" as "DEBIT",
      groupId: food.id,
    });
    expect(res).toEqual({ ok: false, error: "Pick a type" });
    expectNotRevalidated();
  });

  it("rejects a missing name", async () => {
    const { food } = await seedBasics();
    expect(await createCategory({ name: "", type: "DEBIT", groupId: food.id })).toEqual({
      ok: false,
      error: "Name is required",
    });
  });

  it("rejects a duplicate name, even in another group", async () => {
    const { income } = await seedBasics();
    expect(await createCategory({ name: "Groceries", type: "CREDIT", groupId: income.id })).toEqual({
      ok: false,
      error: "A category with that name already exists",
    });
  });

  it("rejects a group that does not exist", async () => {
    await seedBasics();
    const res = await createCategory({ name: "Coffee", type: "DEBIT", groupId: 999 });
    expect(res.ok).toBe(false);
    expect(await db.category.findUnique({ where: { name: "Coffee" } })).toBeNull();
  });
});

describe("getCategories", () => {
  it("orders by group then name and includes the group and transaction count", async () => {
    const { groceries } = await seedBasics();
    await makeTransaction({
      date: "2026-01-02",
      description: "Safeway",
      amountCents: 1000,
      direction: "DEBIT",
      categoryId: groceries.id,
    });

    const categories = await getCategories();
    expect(categories.map((c) => [c.group.name, c.name, c._count.transactions])).toEqual([
      ["Food", "Dining Out", 0],
      ["Food", "Groceries", 1],
      ["Income", "Salary", 0],
    ]);
  });
});

describe("updateCategory", () => {
  it("changes the name, type and group", async () => {
    const { dining, income } = await seedBasics();
    const res = await updateCategory(dining.id, {
      name: "Restaurants",
      type: "TRANSFER",
      groupId: income.id,
    });
    expect(res).toEqual({ ok: true });
    expect(await db.category.findUniqueOrThrow({ where: { id: dining.id } })).toMatchObject({
      name: "Restaurants",
      type: "TRANSFER",
      groupId: income.id,
    });
    expectRevalidated();
  });

  it("keeps existing transactions linked after an edit", async () => {
    const { groceries, food } = await seedBasics();
    const tx = await makeTransaction({
      date: "2026-01-02",
      description: "Safeway",
      amountCents: 1000,
      direction: "DEBIT",
      categoryId: groceries.id,
    });
    await updateCategory(groceries.id, { name: "Supermarket", type: "DEBIT", groupId: food.id });
    expect((await db.transaction.findUniqueOrThrow({ where: { id: tx.id } })).categoryId).toBe(
      groceries.id,
    );
  });

  it("rejects renaming to an existing name", async () => {
    const { dining, food } = await seedBasics();
    expect(
      await updateCategory(dining.id, { name: "Groceries", type: "DEBIT", groupId: food.id }),
    ).toEqual({ ok: false, error: "A category with that name already exists" });
  });

  it("reports a missing category", async () => {
    const { food } = await seedBasics();
    expect(await updateCategory(999, { name: "Ghost", type: "DEBIT", groupId: food.id })).toEqual({
      ok: false,
      error: "That category no longer exists",
    });
  });
});

describe("deleteCategory", () => {
  async function withTransactions() {
    const fixture = await seedBasics();
    for (const description of ["Safeway", "Trader Joe's", "Costco"]) {
      await makeTransaction({
        date: "2026-01-02",
        description,
        amountCents: 1000,
        direction: "DEBIT",
        categoryId: fixture.groceries.id,
      });
    }
    return fixture;
  }

  it("deletes an unused category", async () => {
    const { dining } = await seedBasics();
    expect(await deleteCategory(dining.id)).toEqual({ ok: true });
    expect(await db.category.findUnique({ where: { id: dining.id } })).toBeNull();
    expectRevalidated();
  });

  it("refuses to delete a category in use when no replacement is given", async () => {
    const { groceries } = await withTransactions();
    expect(await deleteCategory(groceries.id)).toEqual({
      ok: false,
      error: "This category is used by 3 transactions. Choose a category to move them to.",
    });
    expect(await db.category.findUnique({ where: { id: groceries.id } })).not.toBeNull();
    expect(await db.transaction.count({ where: { categoryId: groceries.id } })).toBe(3);
    expectNotRevalidated();
  });

  it("moves transactions to the replacement category, then deletes", async () => {
    const { groceries, dining } = await withTransactions();
    expect(await deleteCategory(groceries.id, dining.id)).toEqual({ ok: true });
    expect(await db.category.findUnique({ where: { id: groceries.id } })).toBeNull();
    expect(await db.transaction.count({ where: { categoryId: dining.id } })).toBe(3);
    expectRevalidated();
  });

  it("refuses to move transactions to the category being deleted", async () => {
    const { groceries } = await withTransactions();
    expect(await deleteCategory(groceries.id, groceries.id)).toEqual({
      ok: false,
      error: "Pick a different category to move transactions to",
    });
    expect(await db.transaction.count({ where: { categoryId: groceries.id } })).toBe(3);
  });

  it("rolls back when the replacement category does not exist", async () => {
    const { groceries } = await withTransactions();
    const res = await deleteCategory(groceries.id, 999);
    expect(res.ok).toBe(false);
    expect(await db.category.findUnique({ where: { id: groceries.id } })).not.toBeNull();
    expect(await db.transaction.count({ where: { categoryId: groceries.id } })).toBe(3);
  });

  it("reports a missing category", async () => {
    await seedBasics();
    expect(await deleteCategory(999)).toEqual({
      ok: false,
      error: "That category no longer exists",
    });
  });

  it("ignores a replacement for an unused category", async () => {
    const { food } = await seedBasics();
    const spare = await makeCategory("Spare", "DEBIT", food.id);
    const other = await makeCategory("Other", "DEBIT", food.id);
    expect(await deleteCategory(spare.id, other.id)).toEqual({ ok: true });
    expect(await db.category.findUnique({ where: { id: other.id } })).not.toBeNull();
  });
});
