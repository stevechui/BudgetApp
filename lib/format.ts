const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

export function formatCents(cents: number) {
  return currency.format(cents / 100);
}

export function centsToInput(cents: number) {
  return (cents / 100).toFixed(2);
}

/** Transaction dates are calendar days stored as UTC midnight. */
export function dateToInput(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function inputToDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

export function formatDay(date: Date) {
  return date.toLocaleDateString("en-US", {
    timeZone: "UTC",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export const CATEGORY_TYPE_LABELS = {
  CREDIT: "Credit (income)",
  DEBIT: "Debit (expense)",
  TRANSFER: "Transfer (no budget impact)",
} as const;
