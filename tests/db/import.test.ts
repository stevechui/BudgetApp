import { describe, expect, it } from "vitest";
import {
  deleteTemplate,
  findPossibleDuplicates,
  importTransactions,
  saveTemplate,
  undoImport,
  updateTemplate,
} from "@/lib/actions/import";
import { DEFAULT_CONFIG } from "@/lib/import/types";
import { db, expectNotRevalidated, expectRevalidated, makeTransaction, seedBasics } from "./helpers";

const row = (categoryId: number, overrides: Record<string, string> = {}) => ({
  date: "2026-03-01",
  description: "STARBUCKS",
  amount: "5.25",
  direction: "DEBIT" as const,
  categoryId,
  ...overrides,
});

describe("importTransactions", () => {
  it("creates a batch and links every imported transaction to it", async () => {
    const { groceries, salary, card } = await seedBasics();
    const res = await importTransactions({
      fileName: "march.pdf",
      accountId: card.id,
      rows: [
        row(groceries.id),
        row(salary.id, { description: "PAYROLL", amount: "2000", direction: "CREDIT" }),
      ],
    });
    expect(res).toMatchObject({ ok: true, count: 2 });
    if (!res.ok) return;

    const batch = await db.importBatch.findUniqueOrThrow({
      where: { id: res.batchId },
      include: { transactions: { orderBy: { id: "asc" } } },
    });
    expect(batch.fileName).toBe("march.pdf");
    expect(
      batch.transactions.map((t) => [t.description, t.amountCents, t.direction, t.accountId]),
    ).toEqual([
      ["STARBUCKS", 525, "DEBIT", card.id],
      ["PAYROLL", 200000, "CREDIT", card.id],
    ]);
    expectRevalidated();
  });

  it("reports which row is invalid and imports nothing", async () => {
    const { groceries, checking } = await seedBasics();
    const res = await importTransactions({
      fileName: "march.pdf",
      accountId: checking.id,
      rows: [row(groceries.id), row(groceries.id, { amount: "0" })],
    });
    expect(res).toEqual({ ok: false, error: "Row 2: Amount must be greater than 0" });
    expect(await db.transaction.count()).toBe(0);
    expect(await db.importBatch.count()).toBe(0);
    expectNotRevalidated();
  });

  it("requires at least one row", async () => {
    expect(await importTransactions({ fileName: "march.pdf", accountId: 1, rows: [] })).toEqual({
      ok: false,
      error: "Select at least one row to import",
    });
  });

  it("requires an account", async () => {
    const { groceries } = await seedBasics();
    expect(
      await importTransactions({ fileName: "march.pdf", accountId: "", rows: [row(groceries.id)] }),
    ).toEqual({ ok: false, error: "Pick an account" });
  });

  it("rolls back the whole batch when a category is missing", async () => {
    const { groceries, checking } = await seedBasics();
    const res = await importTransactions({
      fileName: "march.pdf",
      accountId: checking.id,
      rows: [row(groceries.id), row(999)],
    });
    expect(res).toEqual({
      ok: false,
      error: "The selected account or one of the categories no longer exists",
    });
    expect(await db.transaction.count()).toBe(0);
    expect(await db.importBatch.count()).toBe(0);
  });

  it("fails cleanly when the account is missing", async () => {
    const { groceries } = await seedBasics();
    const res = await importTransactions({
      fileName: "march.pdf",
      accountId: 999,
      rows: [row(groceries.id)],
    });
    expect(res.ok).toBe(false);
    expect(await db.importBatch.count()).toBe(0);
  });
});

describe("undoImport", () => {
  it("deletes the batch and its transactions but keeps others", async () => {
    const { groceries, checking } = await seedBasics();
    const manual = await makeTransaction({
      date: "2026-03-02",
      description: "Manual entry",
      amountCents: 100,
      direction: "DEBIT",
      categoryId: groceries.id,
    });
    const batch = (fileName: string) =>
      importTransactions({ fileName, accountId: checking.id, rows: [row(groceries.id)] });
    const first = await batch("a.pdf");
    const second = await batch("b.pdf");
    if (!first.ok || !second.ok) throw new Error("import failed");

    expect(await undoImport(first.batchId)).toEqual({ ok: true });
    expect(await db.importBatch.findUnique({ where: { id: first.batchId } })).toBeNull();
    const remaining = await db.transaction.findMany({ orderBy: { id: "asc" } });
    expect(remaining.map((t) => t.id)).toContain(manual.id);
    expect(remaining.filter((t) => t.importBatchId === second.batchId)).toHaveLength(1);
    expect(remaining).toHaveLength(2);
  });

  it("reports a missing batch", async () => {
    expect(await undoImport(999)).toEqual({ ok: false, error: "That import no longer exists" });
  });
});

describe("findPossibleDuplicates", () => {
  it("returns transactions in the inclusive range with dates as YYYY-MM-DD", async () => {
    const { groceries, checking } = await seedBasics();
    for (const date of ["2026-02-28", "2026-03-01", "2026-03-31", "2026-04-01"]) {
      await makeTransaction({
        date,
        description: date,
        amountCents: 100,
        direction: "DEBIT",
        categoryId: groceries.id,
      });
    }
    const found = await findPossibleDuplicates("2026-03-01", "2026-03-31", checking.id);
    expect(found.map((t) => t.date).sort()).toEqual(["2026-03-01", "2026-03-31"]);
  });

  it("only looks at the chosen account", async () => {
    const { groceries, checking, card } = await seedBasics();
    await makeTransaction({
      date: "2026-03-05",
      description: "On the card",
      amountCents: 100,
      direction: "DEBIT",
      categoryId: groceries.id,
      accountId: card.id,
    });
    expect(await findPossibleDuplicates("2026-03-01", "2026-03-31", checking.id)).toEqual([]);
    expect(await findPossibleDuplicates("2026-03-01", "2026-03-31", card.id)).toHaveLength(1);
  });

  it("returns nothing for a malformed range", async () => {
    expect(await findPossibleDuplicates("March", "2026-03-31", 1)).toEqual([]);
  });
});

describe("statement templates", () => {
  const template = { name: "Chase", fingerprint: "JPMorgan Chase", config: DEFAULT_CONFIG };

  it("saves, updates and deletes a template", async () => {
    const saved = await saveTemplate(template);
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;

    const stored = await db.statementTemplate.findUniqueOrThrow({ where: { id: saved.id } });
    expect(JSON.parse(stored.config)).toEqual(DEFAULT_CONFIG);
    expect(stored.accountId).toBeNull();

    const updated = await updateTemplate(saved.id, {
      ...template,
      config: { ...DEFAULT_CONFIG, dateFormat: "DMY" },
    });
    expect(updated).toEqual({ ok: true });
    const after = await db.statementTemplate.findUniqueOrThrow({ where: { id: saved.id } });
    expect(JSON.parse(after.config).dateFormat).toBe("DMY");

    expect(await deleteTemplate(saved.id)).toEqual({ ok: true });
    expect(await db.statementTemplate.count()).toBe(0);
  });

  it("remembers the template's account, and clears it when the account is deleted", async () => {
    const { card } = await seedBasics();
    const saved = await saveTemplate({ ...template, accountId: card.id });
    if (!saved.ok) throw new Error(saved.error);
    const stored = () => db.statementTemplate.findUniqueOrThrow({ where: { id: saved.id } });
    expect((await stored()).accountId).toBe(card.id);

    await db.account.delete({ where: { id: card.id } });
    expect((await stored()).accountId).toBeNull();
  });

  it("rejects a duplicate name and a short fingerprint", async () => {
    await saveTemplate(template);
    expect(await saveTemplate(template)).toEqual({
      ok: false,
      error: "A template with that name already exists",
    });
    expect(await saveTemplate({ ...template, name: "Other", fingerprint: "ab" })).toEqual({
      ok: false,
      error: "Enter some text that appears on this bank's statements",
    });
  });
});
