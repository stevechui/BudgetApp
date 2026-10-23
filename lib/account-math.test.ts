import { describe, expect, it } from "vitest";
import { balanceFromTotals, withBalances } from "./account-math";

describe("balanceFromTotals", () => {
  it("returns the opening balance when there are no transactions", () => {
    expect(balanceFromTotals(12_345, [])).toBe(12_345);
  });

  it("adds credits and subtracts debits", () => {
    expect(
      balanceFromTotals(10_000, [
        { direction: "CREDIT", amountCents: 5_000 },
        { direction: "DEBIT", amountCents: 2_500 },
      ]),
    ).toBe(12_500);
  });

  it("goes negative for a credit card with spending, and a payment brings it back", () => {
    const spent = balanceFromTotals(0, [{ direction: "DEBIT", amountCents: 80_000 }]);
    expect(spent).toBe(-80_000);
    expect(
      balanceFromTotals(0, [
        { direction: "DEBIT", amountCents: 80_000 },
        { direction: "CREDIT", amountCents: 80_000 },
      ]),
    ).toBe(0);
  });

  it("supports a negative opening balance", () => {
    expect(balanceFromTotals(-30_000, [{ direction: "CREDIT", amountCents: 10_000 }])).toBe(-20_000);
  });
});

describe("withBalances", () => {
  it("attaches balance and count per account", () => {
    const accounts = [
      { id: 1, name: "Checking", openingBalanceCents: 100_000 },
      { id: 2, name: "Card", openingBalanceCents: 0 },
      { id: 3, name: "Empty", openingBalanceCents: 500 },
    ];
    const result = withBalances(accounts, [
      { accountId: 1, direction: "CREDIT", amountCents: 50_000, count: 2 },
      { accountId: 1, direction: "DEBIT", amountCents: 20_000, count: 5 },
      { accountId: 2, direction: "DEBIT", amountCents: 7_500, count: 3 },
    ]);
    expect(result.map((a) => [a.name, a.balanceCents, a.transactionCount])).toEqual([
      ["Checking", 130_000, 7],
      ["Card", -7_500, 3],
      ["Empty", 500, 0],
    ]);
  });
});
