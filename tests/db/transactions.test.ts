import { describe, expect, it } from "vitest";
import {
  createTransaction,
  deleteTransaction,
  deleteTransactions,
  setTransactionCategory,
  setTransactionsCategory,
  updateTransaction,
} from "@/lib/actions/transactions";
import { getRecentTransactions, getTransactions, PAGE_SIZE } from "@/lib/queries";
import {
  db,
  expectNotRevalidated,
  expectRevalidated,
  makeTransaction,
  seedBasics,
} from "./helpers";

const valid = (categoryId: number, accountId: number) => ({
  date: "2026-03-15",
  description: "Safeway",
  amount: "42.50",
  direction: "DEBIT" as const,
  categoryId,
  accountId,
});

describe("createTransaction", () => {
  it("stores the amount in cents and the date as UTC midnight", async () => {
    const { groceries, card } = await seedBasics();
    expect(
      await createTransaction({ ...valid(groceries.id, card.id), description: "  Safeway  " }),
    ).toEqual({ ok: true });
    const [tx] = await db.transaction.findMany();
    expect(tx).toMatchObject({
      description: "Safeway",
      amountCents: 4250,
      direction: "DEBIT",
      categoryId: groceries.id,
      accountId: card.id,
      importBatchId: null,
    });
    expect(tx.date.toISOString()).toBe("2026-03-15T00:00:00.000Z");
    expectRevalidated();
  });

  it.each([
    ["19.99", 1999],
    ["0.1", 10],
    ["1000", 100000],
    ["0.01", 1],
  ])("converts %s to %i cents", async (amount, cents) => {
    const { groceries, checking } = await seedBasics();
    await createTransaction({ ...valid(groceries.id, checking.id), amount });
    expect((await db.transaction.findFirstOrThrow()).amountCents).toBe(cents);
  });

  it.each([
    ["0", "Amount must be greater than 0"],
    ["0.00", "Amount must be greater than 0"],
    ["-5", "Enter a positive amount, e.g. 12.34"],
    ["12.345", "Enter a positive amount, e.g. 12.34"],
    ["abc", "Enter a positive amount, e.g. 12.34"],
    ["", "Enter a positive amount, e.g. 12.34"],
  ])("rejects amount %j", async (amount, error) => {
    const { groceries, checking } = await seedBasics();
    expect(await createTransaction({ ...valid(groceries.id, checking.id), amount })).toEqual({
      ok: false,
      error,
    });
    expect(await db.transaction.count()).toBe(0);
    expectNotRevalidated();
  });

  it.each([
    [{ date: "03/15/2026" }, "Enter a valid date"],
    [{ description: "   " }, "Description is required"],
    [{ direction: "SIDEWAYS" }, "Pick credit or debit"],
    [{ accountId: "" }, "Pick an account"],
  ])("rejects %j", async (override, error) => {
    const { groceries, checking } = await seedBasics();
    const res = await createTransaction({ ...valid(groceries.id, checking.id), ...override } as never);
    expect(res).toEqual({ ok: false, error });
  });

  it("rejects a category that does not exist", async () => {
    const { checking } = await seedBasics();
    const res = await createTransaction(valid(999, checking.id));
    expect(res.ok).toBe(false);
    expect(await db.transaction.count()).toBe(0);
  });

  it("rejects an account that does not exist", async () => {
    const { groceries } = await seedBasics();
    const res = await createTransaction(valid(groceries.id, 999));
    expect(res.ok).toBe(false);
    expect(await db.transaction.count()).toBe(0);
  });
});

describe("updateTransaction", () => {
  it("updates every field", async () => {
    const { groceries, salary, checking, card } = await seedBasics();
    const tx = await makeTransaction({
      date: "2026-03-15",
      description: "Safeway",
      amountCents: 4250,
      direction: "DEBIT",
      categoryId: groceries.id,
      accountId: card.id,
    });
    const res = await updateTransaction(tx.id, {
      date: "2026-04-01",
      description: "Paycheck",
      amount: "2500",
      direction: "CREDIT",
      categoryId: salary.id,
      accountId: checking.id,
    });
    expect(res).toEqual({ ok: true });
    const updated = await db.transaction.findUniqueOrThrow({ where: { id: tx.id } });
    expect(updated).toMatchObject({
      description: "Paycheck",
      amountCents: 250000,
      direction: "CREDIT",
      categoryId: salary.id,
      accountId: checking.id,
    });
    expect(updated.date.toISOString()).toBe("2026-04-01T00:00:00.000Z");
    expectRevalidated();
  });

  it("leaves the transaction unchanged on invalid input", async () => {
    const { groceries, checking } = await seedBasics();
    const tx = await makeTransaction({
      date: "2026-03-15",
      description: "Safeway",
      amountCents: 4250,
      direction: "DEBIT",
      categoryId: groceries.id,
    });
    const res = await updateTransaction(tx.id, { ...valid(groceries.id, checking.id), amount: "-1" });
    expect(res.ok).toBe(false);
    expect((await db.transaction.findUniqueOrThrow({ where: { id: tx.id } })).amountCents).toBe(4250);
  });

  it("reports a missing transaction", async () => {
    const { groceries, checking } = await seedBasics();
    expect(await updateTransaction(999, valid(groceries.id, checking.id))).toEqual({
      ok: false,
      error: "That transaction no longer exists",
    });
  });
});

describe("setTransactionCategory", () => {
  it("changes only the category", async () => {
    const { groceries, dining } = await seedBasics();
    const tx = await makeTransaction({
      date: "2026-03-15",
      description: "Safeway",
      amountCents: 4250,
      direction: "DEBIT",
      categoryId: groceries.id,
    });
    expect(await setTransactionCategory(tx.id, dining.id)).toEqual({ ok: true });
    expect(await db.transaction.findUniqueOrThrow({ where: { id: tx.id } })).toMatchObject({
      categoryId: dining.id,
      description: "Safeway",
      amountCents: 4250,
    });
    expectRevalidated();
  });

  it("rejects an invalid category id", async () => {
    const { groceries } = await seedBasics();
    const tx = await makeTransaction({
      date: "2026-03-15",
      description: "Safeway",
      amountCents: 4250,
      direction: "DEBIT",
      categoryId: groceries.id,
    });
    expect((await setTransactionCategory(tx.id, 0)).ok).toBe(false);
    expect((await setTransactionCategory(tx.id, 999)).ok).toBe(false);
    expect((await db.transaction.findUniqueOrThrow({ where: { id: tx.id } })).categoryId).toBe(
      groceries.id,
    );
  });
});

describe("setTransactionsCategory", () => {
  it("updates the selected transactions and reports how many changed", async () => {
    const { groceries, dining } = await seedBasics();
    const first = await makeTransaction({
      date: "2026-03-15",
      description: "Safeway",
      amountCents: 4250,
      direction: "DEBIT",
      categoryId: groceries.id,
    });
    const second = await makeTransaction({
      date: "2026-03-16",
      description: "Market",
      amountCents: 2500,
      direction: "DEBIT",
      categoryId: groceries.id,
    });

    expect(await setTransactionsCategory([first.id, second.id, first.id], dining.id)).toEqual({
      ok: true,
      count: 2,
    });
    expect(
      (await db.transaction.findMany({ orderBy: { id: "asc" } })).map((tx) => tx.categoryId),
    ).toEqual([dining.id, dining.id]);
    expectRevalidated();
  });

  it("rejects empty ids and invalid categories without changing transactions", async () => {
    const { groceries } = await seedBasics();
    const tx = await makeTransaction({
      date: "2026-03-15",
      description: "Safeway",
      amountCents: 4250,
      direction: "DEBIT",
      categoryId: groceries.id,
    });
    expect(await setTransactionsCategory([], groceries.id)).toMatchObject({ ok: false });
    expect(await setTransactionsCategory([tx.id], 0)).toMatchObject({ ok: false });
    expect(await setTransactionsCategory([tx.id], 999)).toMatchObject({ ok: false });
    expect((await db.transaction.findUniqueOrThrow({ where: { id: tx.id } })).categoryId).toBe(
      groceries.id,
    );
    expectNotRevalidated();
  });
});

describe("deleteTransaction", () => {
  it("deletes the transaction", async () => {
    const { groceries } = await seedBasics();
    const tx = await makeTransaction({
      date: "2026-03-15",
      description: "Safeway",
      amountCents: 4250,
      direction: "DEBIT",
      categoryId: groceries.id,
    });
    expect(await deleteTransaction(tx.id)).toEqual({ ok: true });
    expect(await db.transaction.count()).toBe(0);
    expectRevalidated();
  });

  it("reports a missing transaction", async () => {
    expect(await deleteTransaction(999)).toEqual({
      ok: false,
      error: "That transaction no longer exists",
    });
  });
});

describe("deleteTransactions", () => {
  it("deletes the selected transactions and reports how many were removed", async () => {
    const { groceries } = await seedBasics();
    const first = await makeTransaction({
      date: "2026-03-15",
      description: "Safeway",
      amountCents: 4250,
      direction: "DEBIT",
      categoryId: groceries.id,
    });
    const second = await makeTransaction({
      date: "2026-03-16",
      description: "Market",
      amountCents: 2500,
      direction: "DEBIT",
      categoryId: groceries.id,
    });

    expect(await deleteTransactions([first.id, second.id, first.id])).toEqual({
      ok: true,
      count: 2,
    });
    expect(await db.transaction.count()).toBe(0);
    expectRevalidated();
  });

  it("rejects an empty selection", async () => {
    expect(await deleteTransactions([])).toMatchObject({ ok: false });
    expectNotRevalidated();
  });
});

describe("getTransactions", () => {
  async function fixture() {
    const f = await seedBasics();
    const rows = [
      ["2026-01-01", "Paycheck", 400000, "CREDIT", f.salary.id],
      ["2026-01-05", "Safeway", 5000, "DEBIT", f.groceries.id],
      ["2026-01-20", "Safeway refund", 1000, "CREDIT", f.groceries.id],
      ["2026-02-10", "Sushi place", 6000, "DEBIT", f.dining.id],
      ["2026-02-28", "Safeway", 7000, "DEBIT", f.groceries.id],
    ] as const;
    for (const [date, description, amountCents, direction, categoryId] of rows) {
      await makeTransaction({
        date,
        description,
        amountCents,
        direction,
        categoryId,
        accountId: description === "Sushi place" ? f.card.id : f.checking.id,
      });
    }
    return f;
  }
  const descriptions = (r: Awaited<ReturnType<typeof getTransactions>>) =>
    r.rows.map((t) => `${t.description} ${t.date.toISOString().slice(0, 10)}`);

  it("returns everything newest first when unfiltered", async () => {
    await fixture();
    const r = await getTransactions({});
    expect(r.total).toBe(5);
    expect(descriptions(r)).toEqual([
      "Safeway 2026-02-28",
      "Sushi place 2026-02-10",
      "Safeway refund 2026-01-20",
      "Safeway 2026-01-05",
      "Paycheck 2026-01-01",
    ]);
    expect(r.rows[0].category.group.name).toBe("Food");
    expect(r.rows[0].account.name).toBe("Checking");
  });

  it("filters by account", async () => {
    const f = await fixture();
    const card = await getTransactions({ accountId: f.card.id });
    expect(descriptions(card)).toEqual(["Sushi place 2026-02-10"]);
    expect(card.rows[0].account.name).toBe("Visa");
    expect((await getTransactions({ accountId: f.checking.id })).total).toBe(4);
  });

  it("filters by an inclusive date range", async () => {
    await fixture();
    const r = await getTransactions({ from: "2026-01-05", to: "2026-02-10" });
    expect(descriptions(r)).toEqual([
      "Sushi place 2026-02-10",
      "Safeway refund 2026-01-20",
      "Safeway 2026-01-05",
    ]);
  });

  it("filters by an open-ended range", async () => {
    await fixture();
    expect((await getTransactions({ from: "2026-02-01" })).total).toBe(2);
    expect((await getTransactions({ to: "2026-01-05" })).total).toBe(2);
  });

  it("filters by category, group and direction", async () => {
    const f = await fixture();
    expect((await getTransactions({ categoryId: f.groceries.id })).total).toBe(3);
    expect((await getTransactions({ groupId: f.food.id })).total).toBe(4);
    expect((await getTransactions({ direction: "CREDIT" })).total).toBe(2);
  });

  it("searches descriptions", async () => {
    await fixture();
    expect((await getTransactions({ q: "Safeway" })).total).toBe(3);
    expect((await getTransactions({ q: "refund" })).total).toBe(1);
    expect((await getTransactions({ q: "nothing" })).total).toBe(0);
  });

  it("combines filters", async () => {
    const f = await fixture();
    const r = await getTransactions({
      groupId: f.food.id,
      direction: "DEBIT",
      q: "Safeway",
      from: "2026-02-01",
    });
    expect(descriptions(r)).toEqual(["Safeway 2026-02-28"]);
  });

  it(`pages ${PAGE_SIZE} rows at a time`, async () => {
    const { groceries, checking } = await seedBasics();
    await db.transaction.createMany({
      data: Array.from({ length: 120 }, (_, i) => ({
        date: new Date(Date.UTC(2026, 0, 1) + i * 86_400_000),
        description: `Row ${i}`,
        amountCents: 100,
        direction: "DEBIT" as const,
        categoryId: groceries.id,
        accountId: checking.id,
      })),
    });

    const first = await getTransactions({});
    expect(first).toMatchObject({ total: 120, page: 1, pageCount: 3 });
    expect(first.rows).toHaveLength(PAGE_SIZE);
    expect(first.rows[0].description).toBe("Row 119");

    const last = await getTransactions({ page: 3 });
    expect(last.rows).toHaveLength(20);
    expect(last.rows.at(-1)?.description).toBe("Row 0");

    expect((await getTransactions({ page: 0 })).page).toBe(1);
  });

  it("reports one page when there are no results", async () => {
    await seedBasics();
    expect(await getTransactions({})).toMatchObject({ total: 0, page: 1, pageCount: 1, rows: [] });
  });
});

describe("getRecentTransactions", () => {
  it("returns the newest transactions up to the limit", async () => {
    const { groceries } = await seedBasics();
    for (const date of ["2026-01-01", "2026-01-03", "2026-01-02"]) {
      await makeTransaction({
        date,
        description: date,
        amountCents: 100,
        direction: "DEBIT",
        categoryId: groceries.id,
      });
    }
    const recent = await getRecentTransactions(2);
    expect(recent.map((t) => t.description)).toEqual(["2026-01-03", "2026-01-02"]);
    expect(recent[0].category.name).toBe("Groceries");
  });
});
