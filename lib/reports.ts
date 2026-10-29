import "server-only";
import { format } from "date-fns";
import { connection } from "next/server";
import { db } from "@/lib/db";
import { inputToDate } from "@/lib/format";
import {
  buildBreakdown,
  buildCategorySeries,
  buildGroupSeries,
  buildSeries,
  totals,
  type Period,
} from "@/lib/report-math";

/** Fetch transactions (with category and group) between two local calendar days, inclusive. */
export async function getReportTransactions(from: Date, to: Date) {
  await connection();
  return db.transaction.findMany({
    where: {
      date: {
        gte: inputToDate(format(from, "yyyy-MM-dd")),
        lte: inputToDate(format(to, "yyyy-MM-dd")),
      },
    },
    select: {
      date: true,
      amountCents: true,
      direction: true,
      category: { select: { id: true, name: true, type: true, group: { select: { name: true } } } },
    },
  });
}

export async function getSeries({
  period,
  from,
  to,
  groupBy = "none",
  groupKind = "expense",
  categoryIds = [],
}: {
  period: Period;
  from: Date;
  to: Date;
  groupBy?: "none" | "group";
  /** Which side to stack by category group when `groupBy` is "group" */
  groupKind?: "income" | "expense";
  categoryIds?: number[];
}) {
  const transactions = await getReportTransactions(from, to);
  const range = { period, from, to };
  return {
    totals: totals(transactions),
    series: buildSeries(transactions, range),
    groupSeries:
      groupBy === "group"
        ? buildGroupSeries(transactions, { ...range, kind: groupKind })
        : undefined,
    expenseBreakdown: buildBreakdown(transactions, "expense"),
    incomeBreakdown: buildBreakdown(transactions, "income"),
    categorySeries:
      categoryIds.length > 0
        ? buildCategorySeries(transactions, { period, from, to }, categoryIds)
        : undefined,
  };
}
