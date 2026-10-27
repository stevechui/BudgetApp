import { describe, expect, it } from "vitest";
import {
  averagePerPeriod,
  buildBreakdown,
  buildGroupSeries,
  buildSeries,
  defaultRange,
  parseDay,
  totals,
  type ReportTransaction,
} from "./report-math";

const groups = {
  income: { name: "Income" },
  food: { name: "Food" },
  housing: { name: "Housing" },
  transfers: { name: "Transfers" },
};
const salary = { name: "Salary", type: "CREDIT" as const, group: groups.income };
const groceries = { name: "Groceries", type: "DEBIT" as const, group: groups.food };
const dining = { name: "Dining Out", type: "DEBIT" as const, group: groups.food };
const rent = { name: "Rent", type: "DEBIT" as const, group: groups.housing };
const ccPayment = { name: "Credit Card Payment", type: "TRANSFER" as const, group: groups.transfers };

function tx(
  day: string,
  amountCents: number,
  direction: "CREDIT" | "DEBIT",
  category: ReportTransaction["category"],
): ReportTransaction {
  return { date: new Date(`${day}T00:00:00.000Z`), amountCents, direction, category };
}

describe("totals", () => {
  it("excludes transfers", () => {
    const result = totals([
      tx("2026-01-01", 500000, "CREDIT", salary),
      tx("2026-01-02", 10000, "DEBIT", groceries),
      tx("2026-01-03", 99999, "DEBIT", ccPayment),
      tx("2026-01-04", 99999, "CREDIT", ccPayment),
    ]);
    expect(result).toEqual({ income: 500000, expense: 10000, net: 490000 });
  });

  it("treats a credit in a debit category as a refund that reduces expense", () => {
    const result = totals([
      tx("2026-01-02", 10000, "DEBIT", groceries),
      tx("2026-01-05", 2500, "CREDIT", groceries),
    ]);
    expect(result.expense).toBe(7500);
    expect(result.income).toBe(0);
  });

  it("treats a debit in a credit category as reducing income", () => {
    const result = totals([
      tx("2026-01-01", 500000, "CREDIT", salary),
      tx("2026-01-10", 20000, "DEBIT", salary),
    ]);
    expect(result.income).toBe(480000);
  });
});

describe("averagePerPeriod", () => {
  it("averages totals across selected periods, including periods with no activity", () => {
    expect(
      averagePerPeriod([
        { key: "2026-01-01", label: "Jan", income: 10001, expense: 5000, net: 5001 },
        { key: "2026-02-01", label: "Feb", income: 0, expense: 0, net: 0 },
        { key: "2026-03-01", label: "Mar", income: 20000, expense: 10000, net: 10000 },
      ]),
    ).toEqual({ income: 10000, expense: 5000 });
  });

  it("returns zero averages when the selected range has no periods", () => {
    expect(averagePerPeriod([])).toEqual({ income: 0, expense: 0 });
  });
});

describe("buildSeries", () => {
  const data = [
    tx("2026-01-01", 400000, "CREDIT", salary),
    tx("2026-01-31", 5000, "DEBIT", groceries),
    tx("2026-02-01", 210000, "DEBIT", rent),
    tx("2026-04-15", 400000, "CREDIT", salary),
    tx("2026-04-20", 1000, "DEBIT", ccPayment),
  ];

  it("groups by month and fills empty months with zeros", () => {
    const series = buildSeries(data, {
      period: "month",
      from: parseDay("2026-01-01"),
      to: parseDay("2026-04-30"),
    });
    expect(series.map((p) => p.label)).toEqual(["Jan 2026", "Feb 2026", "Mar 2026", "Apr 2026"]);
    expect(series.map((p) => [p.income, p.expense, p.net])).toEqual([
      [400000, 5000, 395000],
      [0, 210000, -210000],
      [0, 0, 0],
      [400000, 0, 400000],
    ]);
  });

  it("groups by quarter", () => {
    const series = buildSeries(data, {
      period: "quarter",
      from: parseDay("2026-01-01"),
      to: parseDay("2026-06-30"),
    });
    expect(series.map((p) => p.label)).toEqual(["Q1 2026", "Q2 2026"]);
    expect(series[0]).toMatchObject({ income: 400000, expense: 215000 });
    expect(series[1]).toMatchObject({ income: 400000, expense: 0 });
  });

  it("groups by ISO week starting Monday", () => {
    // 2026-01-04 is a Sunday, 2026-01-05 a Monday
    const series = buildSeries(
      [tx("2026-01-04", 100, "DEBIT", groceries), tx("2026-01-05", 200, "DEBIT", groceries)],
      { period: "week", from: parseDay("2026-01-01"), to: parseDay("2026-01-11") },
    );
    expect(series.map((p) => [p.key, p.expense])).toEqual([
      ["2025-12-29", 100],
      ["2026-01-05", 200],
    ]);
  });

  it("keeps dates on their calendar day regardless of time zone", () => {
    const series = buildSeries([tx("2026-03-01", 100, "DEBIT", groceries)], {
      period: "month",
      from: parseDay("2026-02-01"),
      to: parseDay("2026-03-31"),
    });
    expect(series.map((p) => p.expense)).toEqual([0, 100]);
  });
});

describe("buildGroupSeries", () => {
  it("stacks expense by group, ordered by total, excluding transfers and income", () => {
    const result = buildGroupSeries(
      [
        tx("2026-01-02", 1000, "DEBIT", groceries),
        tx("2026-01-03", 500, "DEBIT", dining),
        tx("2026-02-01", 210000, "DEBIT", rent),
        tx("2026-02-02", 400000, "CREDIT", salary),
        tx("2026-02-03", 9999, "DEBIT", ccPayment),
      ],
      { period: "month", from: parseDay("2026-01-01"), to: parseDay("2026-02-28") },
    );
    expect(result.groups).toEqual(["Housing", "Food"]);
    expect(result.rows).toEqual([
      { key: "2026-01-01", label: "Jan 2026", Food: 1500, Housing: 0 },
      { key: "2026-02-01", label: "Feb 2026", Food: 0, Housing: 210000 },
    ]);
  });
});

describe("buildBreakdown", () => {
  it("totals per category net of refunds, largest first", () => {
    const result = buildBreakdown(
      [
        tx("2026-01-02", 1000, "DEBIT", groceries),
        tx("2026-01-03", 3000, "DEBIT", dining),
        tx("2026-01-04", 400, "CREDIT", dining),
        tx("2026-01-05", 9999, "DEBIT", ccPayment),
      ],
      "expense",
    );
    expect(result).toEqual([
      { group: "Food", category: "Dining Out", value: 2600 },
      { group: "Food", category: "Groceries", value: 1000 },
    ]);
  });
});

describe("defaultRange", () => {
  it("covers the last 12 months including the current one", () => {
    const { from } = defaultRange("month", parseDay("2026-10-21"));
    expect(from).toEqual(parseDay("2025-11-01"));
  });

  it("covers the last 8 quarters", () => {
    const { from } = defaultRange("quarter", parseDay("2026-10-21"));
    expect(from).toEqual(parseDay("2025-01-01"));
  });
});
