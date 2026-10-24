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
