import type { Direction } from "./types";

export type ExistingTransaction = {
  id: number;
  date: string;
  description: string;
  amountCents: number;
  direction: Direction;
};

const DAY_MS = 86_400_000;

function dayDiff(a: string, b: string) {
  return Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / DAY_MS;
}

/**
 * Finds an existing transaction with the same amount and direction within a day of the row's date.
 * Prefers an exact date, then the closest description.
 */
export function findDuplicate(
  row: { date: string; amountCents: number; direction: Direction; description: string },
  existing: ExistingTransaction[],
): ExistingTransaction | null {
  if (!row.date || !row.amountCents) return null;
  let best: { tx: ExistingTransaction; score: number } | null = null;
  const desc = row.description.toLowerCase();
  for (const tx of existing) {
    if (tx.amountCents !== row.amountCents || tx.direction !== row.direction) continue;
    const days = dayDiff(tx.date, row.date);
    if (days > 1) continue;
    const sameText = tx.description.toLowerCase() === desc ? 0 : 1;
    const score = days * 2 + sameText;
    if (!best || score < best.score) best = { tx, score };
  }
  return best?.tx ?? null;
}
