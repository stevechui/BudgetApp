import { describe, expect, it } from "vitest";
import { createAccount, deleteAccount, updateAccount } from "@/lib/actions/accounts";
import { getAccounts } from "@/lib/queries";
import {
  db,
  expectNotRevalidated,
  expectRevalidated,
  makeAccount,
  makeTransaction,
  seedBasics,
} from "./helpers";

const valid = {
  name: "Wells Fargo Checking",
  institution: "Wells Fargo",
  type: "CHECKING" as const,
  openingBalance: "1250.50",
};

describe("createAccount", () => {
  it("stores the opening balance in cents", async () => {
    expect(await createAccount(valid)).toEqual({ ok: true });
    expect(await db.account.findFirstOrThrow()).toMatchObject({
      name: "Wells Fargo Checking",
      institution: "Wells Fargo",
      type: "CHECKING",
      openingBalanceCents: 125050,
    });
    expectRevalidated();
  });

  it("accepts a negative opening balance and a blank institution", async () => {
    await createAccount({ ...valid, type: "CREDIT_CARD", openingBalance: "-300", institution: "  " });
    expect(await db.account.findFirstOrThrow()).toMatchObject({
      institution: null,
      openingBalanceCents: -30000,
    });
  });

  it.each([
    [{ name: "  " }, "Name is required"],
    [{ type: "LOAN" }, "Pick an account type"],
    [{ openingBalance: "12.345" }, "Enter an amount, e.g. 1250.00 or -300"],
    [{ openingBalance: "" }, "Enter an amount, e.g. 1250.00 or -300"],
  ])("rejects %j", async (override, error) => {
    expect(await createAccount({ ...valid, ...override } as never)).toEqual({ ok: false, error });
    expectNotRevalidated();
  });

  it("rejects a duplicate name", async () => {
    await createAccount(valid);
    expect(await createAccount(valid)).toEqual({
      ok: false,
      error: "An account with that name already exists",
    });
  });
});

describe("updateAccount", () => {
  it("updates every field", async () => {
    const account = await makeAccount("Old name");
    expect(await updateAccount(account.id, { ...valid, type: "SAVINGS" })).toEqual({ ok: true });
    expect(await db.account.findUniqueOrThrow({ where: { id: account.id } })).toMatchObject({
      name: "Wells Fargo Checking",
      type: "SAVINGS",
      openingBalanceCents: 125050,
    });
  });

  it("reports a missing account", async () => {
    expect(await updateAccount(999, valid)).toEqual({
      ok: false,
      error: "That account no longer exists",
    });
  });
});

describe("deleteAccount", () => {
  it("deletes an account without transactions", async () => {
    const account = await makeAccount("Empty");
    expect(await deleteAccount(account.id)).toEqual({ ok: true });
    expect(await db.account.count()).toBe(0);
    expectRevalidated();
  });

  it("requires a target when the account has transactions", async () => {
    const { groceries, card } = await seedBasics();
    await makeTransaction({
      date: "2026-03-01",
      description: "Safeway",
      amountCents: 100,
      direction: "DEBIT",
      categoryId: groceries.id,
      accountId: card.id,
    });
    expect(await deleteAccount(card.id)).toEqual({
      ok: false,
      error: "This account has 1 transaction. Choose an account to move them to.",
    });
    expect(await deleteAccount(card.id, card.id)).toEqual({
      ok: false,
      error: "Pick a different account to move transactions to",
    });
    expect(await db.account.count()).toBe(2);
  });

  it("moves transactions to the target, then deletes", async () => {
    const { groceries, checking, card } = await seedBasics();
    const tx = await makeTransaction({
      date: "2026-03-01",
      description: "Safeway",
      amountCents: 100,
      direction: "DEBIT",
      categoryId: groceries.id,
      accountId: card.id,
    });
    expect(await deleteAccount(card.id, checking.id)).toEqual({ ok: true });
    expect(await db.account.findUnique({ where: { id: card.id } })).toBeNull();
    expect((await db.transaction.findUniqueOrThrow({ where: { id: tx.id } })).accountId).toBe(
      checking.id,
    );
  });
});

describe("getAccounts", () => {
  it("returns balances and transaction counts", async () => {
    const { salary, groceries } = await seedBasics();
    const savings = await makeAccount("Savings", "SAVINGS", 100000);
    const [checking, card] = await Promise.all([
      db.account.findUniqueOrThrow({ where: { name: "Checking" } }),
      db.account.findUniqueOrThrow({ where: { name: "Visa" } }),
    ]);
    const add = (accountId: number, amountCents: number, direction: "CREDIT" | "DEBIT") =>
      makeTransaction({
        date: "2026-03-01",
        description: "x",
        amountCents,
        direction,
        categoryId: direction === "CREDIT" ? salary.id : groceries.id,
        accountId,
      });
    await add(checking.id, 300000, "CREDIT");
    await add(checking.id, 50000, "DEBIT");
    await add(card.id, 12000, "DEBIT");
    await add(card.id, 2000, "DEBIT");

    const accounts = await getAccounts();
    expect(accounts.map((a) => [a.name, a.balanceCents, a.transactionCount])).toEqual([
      ["Checking", 250000, 2],
      ["Savings", 100000, 0],
      ["Visa", -14000, 2],
    ]);
    expect(accounts.find((a) => a.id === savings.id)?.type).toBe("SAVINGS");
  });
});
