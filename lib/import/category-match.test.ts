import { describe, expect, it } from "vitest";
import { createCategoryMatcher, normalizeCategoryLabel } from "./category-match";

const names = [
  "Salary",
  "Groceries",
  "Dining Out",
  "Coffee",
  "Fuel",
  "Gas/Heating",
  "Rent/Mortgage",
  "Bank Fees",
  "Credit Card Payment",
  "Streaming & Subscriptions",
  "Personal Care",
  "Utilities Misc",
];
const categories = names.map((name, i) => ({ id: i + 1, name }));
const idOf = (name: string) => names.indexOf(name) + 1;
const match = createCategoryMatcher(categories);

describe("normalizeCategoryLabel", () => {
  it.each([
    ["Fees & Adjustments", "fee and adjustment"],
    ["  GROCERIES ", "grocery"],
    ["Utilities", "utility"],
    ["Gas", "gas"],
    ["Business Services", "business service"],
    ["Rent/Mortgage", "rent mortgage"],
  ])("normalizes %j", (input, expected) => {
    expect(normalizeCategoryLabel(input)).toBe(expected);
  });
});

describe("createCategoryMatcher", () => {
  it.each([
    ["Groceries", "Groceries"],
    ["groceries", "Groceries"],
    ["GROCERY", "Groceries"],
    ["Streaming and Subscription", "Streaming & Subscriptions"],
    ["Rent/Mortgage", "Rent/Mortgage"],
    ["Bank Fee", "Bank Fees"],
  ])("matches %j exactly", (value, name) => {
    expect(match(value)).toEqual({ categoryId: idOf(name), confidence: "exact" });
  });

  it.each([
    ["Food & Dining > Coffee", "Coffee"],
    ["Food:Groceries", "Groceries"],
    ["Auto & Transport | Fuel", "Fuel"],
  ])("uses the most specific segment of %j", (value, name) => {
    expect(match(value)).toEqual({ categoryId: idOf(name), confidence: "exact" });
  });

  it.each([
    ["Food & Drink", "Dining Out"],
    ["Restaurants", "Dining Out"],
    ["Gas", "Fuel"],
    ["Paycheck", "Salary"],
    ["Fees & Adjustments", "Bank Fees"],
    ["Payment", "Credit Card Payment"],
    ["Auto & Transport > Gas", "Fuel"],
  ])("maps the bank label %j through synonyms", (value, name) => {
    expect(match(value)).toEqual({ categoryId: idOf(name), confidence: "close" });
  });

  it("skips synonyms whose target category does not exist", () => {
    const limited = createCategoryMatcher([{ id: 1, name: "Groceries" }]);
    expect(limited("Food & Drink")).toBeNull();
  });

  it.each([
    ["Grocries", "Groceries"],
    ["Coffe", "Coffee"],
    ["DiningOut", "Dining Out"],
    ["Personal Care Products", "Personal Care"],
  ])("accepts the near miss %j as a close match", (value, name) => {
    expect(match(value)).toEqual({ categoryId: idOf(name), confidence: "close" });
  });

  it.each(["Shopping", "Entertainment", "Pets", "", "   ", "---"])("returns null for %j", (value) => {
    expect(match(value)).toBeNull();
  });
});
