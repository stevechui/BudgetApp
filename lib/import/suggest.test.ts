import { describe, expect, it } from "vitest";
import { findDuplicate } from "./duplicates";
import { createSuggester, normalizeDescription } from "./suggest";

describe("normalizeDescription", () => {
  it("strips numbers, punctuation and noise words", () => {
    expect(normalizeDescription("POS PURCHASE STARBUCKS #1234 SEATTLE WA 01/05")).toBe(
      "starbucks seattle wa",
    );
    expect(normalizeDescription("12345")).toBe("");
  });
});

describe("createSuggester", () => {
  const categories = [
    { id: 1, type: "DEBIT" as const },
    { id: 2, type: "CREDIT" as const },
    { id: 3, type: "TRANSFER" as const },
  ];
  const suggest = createSuggester(
    [
      ["starbucks seattle wa", 1],
      ["acme corp payroll", 2],
      ["chase autopay", 3],
    ],
    categories,
  );

  it("matches exact normalized descriptions", () => {
    expect(suggest("STARBUCKS #999 SEATTLE WA", "DEBIT")).toEqual({ categoryId: 1, match: "exact" });
  });

  it("matches on the merchant word or word overlap", () => {
    expect(suggest("STARBUCKS PORTLAND OR", "DEBIT")).toEqual({ categoryId: 1, match: "similar" });
    expect(suggest("ACME CORP PAYROLL DEP", "CREDIT")).toEqual({ categoryId: 2, match: "similar" });
  });

  it("only suggests categories that fit the direction", () => {
    expect(suggest("STARBUCKS SEATTLE WA", "CREDIT")).toBeNull();
    expect(suggest("CHASE AUTOPAY", "CREDIT")).toEqual({ categoryId: 3, match: "exact" });
  });

  it("returns null for unknown merchants", () => {
    expect(suggest("NEW PLACE", "DEBIT")).toBeNull();
  });
});

describe("findDuplicate", () => {
  const existing = [
    { id: 1, date: "2026-01-05", description: "RENT", amountCents: 150000, direction: "DEBIT" as const },
    { id: 2, date: "2026-01-06", description: "Rent payment", amountCents: 150000, direction: "DEBIT" as const },
  ];

  it("prefers the same date", () => {
    const row = { date: "2026-01-05", description: "Something", amountCents: 150000, direction: "DEBIT" as const };
    expect(findDuplicate(row, existing)?.id).toBe(1);
  });

  it("ignores different amounts, directions or dates more than a day apart", () => {
    expect(findDuplicate({ date: "2026-01-05", description: "", amountCents: 150001, direction: "DEBIT" }, existing)).toBeNull();
    expect(findDuplicate({ date: "2026-01-05", description: "", amountCents: 150000, direction: "CREDIT" }, existing)).toBeNull();
    expect(findDuplicate({ date: "2026-01-09", description: "", amountCents: 150000, direction: "DEBIT" }, existing)).toBeNull();
  });
});
