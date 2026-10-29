import {
  addMonths,
  addQuarters,
  addWeeks,
  format,
  startOfMonth,
  startOfQuarter,
  startOfWeek,
} from "date-fns";

export type Period = "week" | "month" | "quarter";

export const PERIODS: Period[] = ["week", "month", "quarter"];

export type ReportTransaction = {
  /** Calendar date stored as UTC midnight */
  date: Date;
  amountCents: number;
  direction: "CREDIT" | "DEBIT";
  category: {
    id?: number;
    name: string;
    type: "CREDIT" | "DEBIT" | "TRANSFER";
    group: { name: string };
  };
};

export type SeriesPoint = {
  key: string;
  label: string;
  income: number;
  expense: number;
  net: number;
};

/** Convert a UTC-midnight calendar date into a local Date for the same day. */
export function toLocalDay(date: Date) {
  return new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

/** Parse "YYYY-MM-DD" into a local Date for that day. */
export function parseDay(value: string) {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function periodStart(day: Date, period: Period) {
  if (period === "week") return startOfWeek(day, { weekStartsOn: 1 });
  if (period === "month") return startOfMonth(day);
  return startOfQuarter(day);
}

function nextPeriod(start: Date, period: Period) {
  if (period === "week") return addWeeks(start, 1);
  if (period === "month") return addMonths(start, 1);
  return addQuarters(start, 1);
}

export function periodKey(start: Date) {
  return format(start, "yyyy-MM-dd");
}

export function periodLabel(start: Date, period: Period) {
  if (period === "week") return format(start, "MMM d");
  if (period === "month") return format(start, "MMM yyyy");
  return format(start, "QQQ yyyy");
}

/** Every period start from the period containing `from` through the one containing `to`. */
export function periodRange(from: Date, to: Date, period: Period) {
  const starts: Date[] = [];
  const end = periodStart(to, period);
  for (let s = periodStart(from, period); s <= end; s = nextPeriod(s, period)) {
    starts.push(s);
  }
  return starts;
}

/**
 * Budget impact of a transaction, in cents.
 * - CREDIT categories add to income (debits, e.g. a clawback, subtract).
 * - DEBIT categories add to expense (credits, e.g. a refund, subtract).
 * - TRANSFER categories have no impact.
 */
export function budgetImpact(tx: ReportTransaction) {
  const { type } = tx.category;
  if (type === "CREDIT") {
    return { income: tx.direction === "CREDIT" ? tx.amountCents : -tx.amountCents, expense: 0 };
  }
  if (type === "DEBIT") {
    return { income: 0, expense: tx.direction === "DEBIT" ? tx.amountCents : -tx.amountCents };
  }
  return { income: 0, expense: 0 };
}

export function totals(transactions: ReportTransaction[]) {
  let income = 0;
  let expense = 0;
  for (const tx of transactions) {
    const impact = budgetImpact(tx);
    income += impact.income;
    expense += impact.expense;
  }
  return { income, expense, net: income - expense };
}

/** Average income and expense across the selected series buckets, including empty periods. */
export function averagePerPeriod(series: SeriesPoint[]) {
  if (series.length === 0) return { income: 0, expense: 0 };
  const total = series.reduce(
    (sum, point) => ({
      income: sum.income + point.income,
      expense: sum.expense + point.expense,
    }),
    { income: 0, expense: 0 },
  );
  return {
    income: Math.round(total.income / series.length),
    expense: Math.round(total.expense / series.length),
  };
}

export function buildSeries(
  transactions: ReportTransaction[],
  { period, from, to }: { period: Period; from: Date; to: Date },
): SeriesPoint[] {
  const points = new Map<string, SeriesPoint>();
  for (const start of periodRange(from, to, period)) {
    const key = periodKey(start);
    points.set(key, { key, label: periodLabel(start, period), income: 0, expense: 0, net: 0 });
  }
  for (const tx of transactions) {
    const point = points.get(periodKey(periodStart(toLocalDay(tx.date), period)));
    if (!point) continue;
    const impact = budgetImpact(tx);
    point.income += impact.income;
    point.expense += impact.expense;
    point.net = point.income - point.expense;
  }
  return [...points.values()];
}

export type GroupSeries = {
  groups: string[];
  rows: ({ key: string; label: string } & Record<string, number | string>)[];
};

export type CategorySeries = {
  categories: string[];
  rows: ({ key: string; label: string } & Record<string, number | string>)[];
};

/** Spending by selected categories per period. */
export function buildCategorySeries(
  transactions: ReportTransaction[],
  { period, from, to }: { period: Period; from: Date; to: Date },
  categoryIds: number[],
): CategorySeries {
  const ids = new Set(categoryIds);
  const names = new Map<number, string>();
  const rows = new Map<string, CategorySeries["rows"][number]>();
  for (const start of periodRange(from, to, period)) {
    const key = periodKey(start);
    rows.set(key, { key, label: periodLabel(start, period) });
  }
  for (const tx of transactions) {
    const id = tx.category.id;
    if (!id || !ids.has(id)) continue;
    names.set(id, tx.category.name);
    const row = rows.get(periodKey(periodStart(toLocalDay(tx.date), period)));
    if (!row) continue;
    const value = budgetImpact(tx).expense;
    row[tx.category.name] = ((row[tx.category.name] as number | undefined) ?? 0) + value;
  }
  const categories = categoryIds.map((id) => names.get(id)).filter((name): name is string => Boolean(name));
  const out = [...rows.values()];
  for (const row of out) for (const category of categories) row[category] ??= 0;
  return { categories, rows: out };
}

/** Expense per category group per period, for stacked charts. */
export function buildGroupSeries(
  transactions: ReportTransaction[],
  { period, from, to, kind = "expense" }: { period: Period; from: Date; to: Date; kind?: "income" | "expense" },
): GroupSeries {
  const groupTotals = new Map<string, number>();
  const rows = new Map<string, GroupSeries["rows"][number]>();
  for (const start of periodRange(from, to, period)) {
    const key = periodKey(start);
    rows.set(key, { key, label: periodLabel(start, period) });
  }
  for (const tx of transactions) {
    const row = rows.get(periodKey(periodStart(toLocalDay(tx.date), period)));
    if (!row) continue;
    const value = budgetImpact(tx)[kind];
    if (value === 0) continue;
    const group = tx.category.group.name;
    row[group] = ((row[group] as number | undefined) ?? 0) + value;
    groupTotals.set(group, (groupTotals.get(group) ?? 0) + value);
  }
  const groups = [...groupTotals.entries()]
    .filter(([, total]) => total !== 0)
    .sort((a, b) => b[1] - a[1])
    .map(([g]) => g);
  const out = [...rows.values()];
  for (const row of out) for (const g of groups) row[g] ??= 0;
  return { groups, rows: out };
}

export type BreakdownItem = { id?: number; group: string; category: string; value: number };

/** Total per category (with its group) for income or expense, largest first. */
export function buildBreakdown(
  transactions: ReportTransaction[],
  kind: "income" | "expense",
): BreakdownItem[] {
  const map = new Map<string, BreakdownItem>();
  for (const tx of transactions) {
    const value = budgetImpact(tx)[kind];
    if (value === 0) continue;
    const key = `${tx.category.group.name}\u0000${tx.category.name}`;
    const item = map.get(key) ?? {
      id: tx.category.id,
      group: tx.category.group.name,
      category: tx.category.name,
      value: 0,
    };
    item.value += value;
    map.set(key, item);
  }
  return [...map.values()].filter((i) => i.value > 0).sort((a, b) => b.value - a.value);
}

/** Default report window: the last `count` periods ending with the one containing `today`. */
export function defaultRange(period: Period, today: Date) {
  const count = period === "week" ? 12 : period === "month" ? 12 : 8;
  let start = periodStart(today, period);
  for (let i = 1; i < count; i++) {
    if (period === "week") start = addWeeks(start, -1);
    else if (period === "month") start = addMonths(start, -1);
    else start = addQuarters(start, -1);
  }
  return { from: start, to: today };
}
