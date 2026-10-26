import { importRowSchema } from "@/lib/validation";
import { findDuplicate, type ExistingTransaction } from "./duplicates";
import type { Suggestion } from "./suggest";
import type { AmountCandidate, Direction, DraftRow } from "./types";

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
  amountCandidates: AmountCandidate[];
  balanceCents: number | null;
  sourceLines: number[];
  sourceCategory: string;
  /** "csv" when the category came from the file's Category column */
  suggestion: Suggestion["match"] | "csv" | null;
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
 * Category precedence: the row's own edit, then the file's category column, then history.
 */
export function buildReviewRows({
  drafts,
  manualRows,
  deleted,
  edits,
  suggest,
  mapCategory = () => null,
  existing,
}: {
  drafts: DraftRow[];
  manualRows: DraftRow[];
  deleted: ReadonlySet<string>;
  edits: Record<string, RowEdit>;
  suggest: (description: string, direction: Direction) => Suggestion | null;
  /** Category id for a value from the file's category column, or null when unmapped */
  mapCategory?: (sourceCategory: string) => number | null;
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
      const mapped = draft.sourceCategory.trim() ? mapCategory(draft.sourceCategory) : null;
      const s = mapped === null ? suggest(description, direction) : null;
      if (mapped !== null) {
        categoryId = String(mapped);
        suggestion = "csv";
      } else if (s) {
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
    const parsed = importRowSchema.safeParse(toTransactionInput(values));
    const errors = parsed.success
      ? []
      : [...new Set(parsed.error.issues.map((i) => (i.path[0] === "categoryId" ? "Pick a category" : i.message)))];

    return {
      ...values,
      key: draft.key,
      manual,
      amountCents,
      amountCandidates: draft.amountCandidates,
      balanceCents: draft.balanceCents,
      sourceLines: draft.sourceLines,
      sourceCategory: draft.sourceCategory,
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
    amountCandidates: [],
    direction: "DEBIT",
    balanceCents: null,
    sourceCategory: "",
    sourceLines: [],
    warnings: [],
  };
}
