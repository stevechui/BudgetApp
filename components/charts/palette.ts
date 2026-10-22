export const INCOME_COLOR = "#10b981";
export const EXPENSE_COLOR = "#f43f5e";
export const NET_COLOR = "#6366f1";

export const PALETTE = [
  "#6366f1",
  "#f59e0b",
  "#10b981",
  "#ef4444",
  "#06b6d4",
  "#8b5cf6",
  "#84cc16",
  "#ec4899",
  "#f97316",
  "#14b8a6",
  "#a855f7",
  "#64748b",
];

export function colorAt(i: number) {
  return PALETTE[i % PALETTE.length];
}

const compact = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});
const full = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export const formatAxis = (dollars: number) => compact.format(dollars);
export const formatDollars = (dollars: number) => full.format(dollars);
