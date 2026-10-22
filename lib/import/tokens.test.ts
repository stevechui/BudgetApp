import { describe, expect, it } from "vitest";
import { parseLeadingDate, parseLooseMoney, parseMoney, resolveYear } from "./tokens";

describe("parseMoney", () => {
  it.each([
    ["1,234.56", 123456, false, null],
    ["$12.00", 1200, false, null],
    ["(12.00)", 1200, true, null],
    ["-12.00", 1200, true, null],
    ["12.00-", 1200, true, null],
    ["12.00CR", 1200, false, "CR"],
    ["0.99DR", 99, false, "DR"],
  ])("parses %s", (token, cents, negative, suffix) => {
    expect(parseMoney(token)).toEqual({ cents, negative, suffix });
  });

  it.each(["1234", "12.5", "#123", "(12.00", "1,23.00", "01/05"])("rejects %s", (token) => {
    expect(parseMoney(token)).toBeNull();
  });
});

describe("parseLooseMoney", () => {
  it.each([
    ["45", 4500, false],
    ["1,234", 123400, false],
    ["12.5", 1250, false],
    ["(7)", 700, true],
    ["1,234.56", 123456, false],
  ])("parses %s", (token, cents, negative) => {
    expect(parseLooseMoney(token)).toMatchObject({ cents, negative });
  });

  it.each(["#123", "12.345", "abc"])("rejects %s", (token) => {
    expect(parseLooseMoney(token)).toBeNull();
  });
});

describe("parseLeadingDate", () => {
  it.each([
    [["01/05"], "MDY", { y: null, m: 1, d: 5 }, 1],
    [["01/05"], "DMY", { y: null, m: 5, d: 1 }, 1],
    [["1/5/26"], "MDY", { y: 2026, m: 1, d: 5 }, 1],
    [["2026-01-05"], "MDY", { y: 2026, m: 1, d: 5 }, 1],
    [["05-Jan-2026"], "MDY", { y: 2026, m: 1, d: 5 }, 1],
    [["05Jan"], "MDY", { y: null, m: 1, d: 5 }, 1],
    [["05", "Jan", "2026", "X"], "MDY", { y: 2026, m: 1, d: 5 }, 3],
    [["Jan", "5,", "2026"], "MDY", { y: 2026, m: 1, d: 5 }, 3],
    [["Sept", "30", "COFFEE"], "MDY", { y: null, m: 9, d: 30 }, 2],
  ] as const)("reads %j as %s", (words, format, date, consumed) => {
    expect(parseLeadingDate([...words], format)).toEqual({ date, consumed });
  });

  it.each([[["13/05"]], [["02/30/2026"]], [["Debit", "5"]], [["5", "ITEMS"]]])(
    "rejects %j",
    (words) => {
      expect(parseLeadingDate(words, "MDY")).toBeNull();
    },
  );
});

describe("resolveYear", () => {
  it("uses the statement end year, rolling back for December rows on a January statement", () => {
    expect(resolveYear({ y: null, m: 1, d: 5 }, "2026-01-31")).toBe("2026-01-05");
    expect(resolveYear({ y: null, m: 12, d: 28 }, "2026-01-31")).toBe("2025-12-28");
    expect(resolveYear({ y: 2024, m: 3, d: 1 }, "2026-01-31")).toBe("2024-03-01");
  });
});
