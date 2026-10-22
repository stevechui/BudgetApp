import { transactionSchema } from "@/lib/validation";
import { findDuplicate, type ExistingTransaction } from "./duplicates";
import type { Suggestion } from "./suggest";
import type { Direction, DraftRow } from "./types";

export type RowValues = {
  include: boolean;
  date: string;
  description: string;
  amount: string;
  direction: Direction;
  /** "" when no category is chosen */
  categoryId: string;
};

export type RowEdit = Partial<RowValues>;

export type ReviewRow = RowValues & {
  key: string;
  manual: boolean;
  amountCents: number;
  balanceCents: number | null;
  sourceLines: number[];
  suggestion: Suggestion["match"] | null;
  duplicate: ExistingTransaction | null;
  warnings: string[];
  errors: string[];
};

/** Accepts amounts typed as "$1,234.56". */
export function normalizeAmount(value: string) {
  return value.replace(/[$,\s]/g, "");
}

export function toTransactionInput(row: RowValues) {
  return {
    date: row.date,
    description: row.description,
    amount: normalizeAmount(row.amount),
    direction: row.direction,
    categoryId: Number(row.categoryId) || 0,
  };
}

/**
 * Combines parsed rows with the user's edits, then fills in category suggestions,
 * duplicate flags and validation errors. Rows flagged as duplicates start unchecked.
 */
export function buildReviewRows({
  drafts,
  manualRows,
  deleted,
  edits,
  suggest,
  existing,
}: {
  drafts: DraftRow[];
  manualRows: DraftRow[];
  deleted: ReadonlySet<string>;
  edits: Record<string, RowEdit>;
  suggest: (description: string, direction: Direction) => Suggestion | null;
  existing: ExistingTransaction[];
}): ReviewRow[] {
  const all = [
    ...drafts.filter((d) => !deleted.has(d.key)).map((d) => ({ draft: d, manual: false })),
    ...manualRows.filter((d) => !deleted.has(d.key)).map((d) => ({ draft: d, manual: true })),
  ];
  return all.map(({ draft, manual }) => {
    const edit = edits[draft.key] ?? {};
    const date = edit.date ?? draft.date;
    const description = edit.description ?? draft.description;
    const amount = edit.amount ?? draft.amount;
    const direction = edit.direction ?? draft.direction;
    const amountNumber = Number(normalizeAmount(amount));
    const amountCents = Number.isFinite(amountNumber) ? Math.round(amountNumber * 100) : 0;

    let categoryId = edit.categoryId ?? "";
    let suggestion: ReviewRow["suggestion"] = null;
    if (edit.categoryId === undefined) {
      const s = suggest(description, direction);
      if (s) {
        categoryId = String(s.categoryId);
        suggestion = s.match;
      }
    }

    const duplicate = manual ? null : findDuplicate({ date, description, amountCents, direction }, existing);
    const values: RowValues = {
      include: edit.include ?? !duplicate,
      date,
      description,
      amount,
      direction,
      categoryId,
    };
    const parsed = transactionSchema.safeParse(toTransactionInput(values));
    const errors = parsed.success
      ? []
      : [...new Set(parsed.error.issues.map((i) => (i.path[0] === "categoryId" ? "Pick a category" : i.message)))];

    return {
      ...values,
      key: draft.key,
      manual,
      amountCents,
      balanceCents: draft.balanceCents,
      sourceLines: draft.sourceLines,
      suggestion,
      duplicate,
      warnings: draft.warnings,
      errors,
    };
  });
}

let manualCounter = 0;

export function blankRow(date: string): DraftRow {
  manualCounter += 1;
  return {
    key: `M${Date.now()}-${manualCounter}`,
    date,
    description: "",
    amount: "",
    amountCents: 0,
    direction: "DEBIT",
    balanceCents: null,
    sourceLines: [],
    warnings: [],
  };
}
