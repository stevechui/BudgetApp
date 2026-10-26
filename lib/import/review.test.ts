import { describe, expect, it } from "vitest";
import { buildReviewRows } from "./review";
import type { DraftRow } from "./types";

const draft: DraftRow = {
  key: "L1",
  date: "2026-03-01",
  description: "SAFEWAY #1234",
  amount: "82.15",
  amountCents: 8215,
  amountCandidates: [{ amount: "82.15", amountCents: 8215, direction: "DEBIT" }],
  direction: "DEBIT",
  balanceCents: null,
  sourceCategory: "",
  sourceLines: [1],
  warnings: [],
};

function build(categoryId?: string) {
  return buildReviewRows({
    drafts: [draft],
    manualRows: [],
    deleted: new Set(),
    edits: categoryId === undefined ? {} : { L1: { categoryId } },
    suggest: () => null,
    existing: [],
  });
}

describe("buildReviewRows", () => {
  it("accepts a complete row without an account, which is chosen for the whole import", () => {
    expect(build("7")[0].errors).toEqual([]);
  });

  it("asks for a category when none is set", () => {
    expect(build()[0].errors).toEqual(["Pick a category"]);
  });

  it("keeps parsed amount candidates available in the review row", () => {
    expect(build()[0].amountCandidates).toEqual(draft.amountCandidates);
  });
});

describe("buildReviewRows category precedence", () => {
  const csvDraft: DraftRow = { ...draft, sourceCategory: "Supermarkets" };
  const suggest = () => ({ categoryId: 3, match: "exact" as const });

  function rows(opts: {
    sourceDraft?: DraftRow;
    edit?: string;
    mapCategory?: (value: string) => number | null;
  }) {
    return buildReviewRows({
      drafts: [opts.sourceDraft ?? csvDraft],
      manualRows: [],
      deleted: new Set(),
      edits: opts.edit === undefined ? {} : { L1: { categoryId: opts.edit } },
      suggest,
      mapCategory: opts.mapCategory,
      existing: [],
    });
  }

  it("prefers the mapped CSV category over the history suggestion", () => {
    const seen: string[] = [];
    const [row] = rows({ mapCategory: (v) => (seen.push(v), 9) });
    expect(seen).toEqual(["Supermarkets"]);
    expect(row).toMatchObject({ categoryId: "9", suggestion: "csv", sourceCategory: "Supermarkets" });
  });

  it("falls back to history when the CSV value is unmapped", () => {
    expect(rows({ mapCategory: () => null })[0]).toMatchObject({ categoryId: "3", suggestion: "exact" });
  });

  it("does not consult the mapping for rows without a CSV category", () => {
    const [row] = rows({
      sourceDraft: draft,
      mapCategory: () => {
        throw new Error("should not be called");
      },
    });
    expect(row).toMatchObject({ categoryId: "3", suggestion: "exact", sourceCategory: "" });
  });

  it("keeps the user's own pick over both", () => {
    expect(rows({ edit: "5", mapCategory: () => 9 })[0]).toMatchObject({ categoryId: "5", suggestion: null });
  });
});
