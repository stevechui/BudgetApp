import type { Direction, StatementBalances } from "./types";

export type ReconcileRow = { amountCents: number; direction: Direction; balanceCents: number | null };

export type Reconciliation =
  | { status: "unknown" }
  | {
      status: "ok" | "mismatch";
      opening: number;
      closing: number;
      /** closing − expected closing, in cents */
      diff: number;
      /** "asset" for bank accounts (credits raise the balance), "liability" for credit cards */
      convention: "asset" | "liability";
    };

/**
 * Checks opening + credits − debits = closing (or the reverse for credit cards).
 * Uses the statement's stated balances when found, otherwise the first and last running balances.
 */
export function reconcile(rows: ReconcileRow[], balances: StatementBalances): Reconciliation {
  if (rows.length === 0) return { status: "unknown" };
  let credits = 0;
  let debits = 0;
  for (const r of rows) {
    if (r.direction === "CREDIT") credits += r.amountCents;
    else debits += r.amountCents;
  }
  const first = rows[0];
  const lastRow = rows[rows.length - 1];

  let best: Extract<Reconciliation, { diff: number }> | null = null;
  for (const [convention, sign] of [["asset", 1], ["liability", -1]] as const) {
    const firstSigned = sign * (first.direction === "CREDIT" ? first.amountCents : -first.amountCents);
    const opening =
      balances.opening ?? (first.balanceCents !== null ? first.balanceCents - firstSigned : null);
    const closing = balances.closing ?? lastRow.balanceCents;
    if (opening === null || closing === null) continue;
    const diff = closing - (opening + sign * (credits - debits));
    if (!best || Math.abs(diff) < Math.abs(best.diff)) {
      best = { status: diff === 0 ? "ok" : "mismatch", opening, closing, diff, convention };
    }
  }
  return best ?? { status: "unknown" };
}
