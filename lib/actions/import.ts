"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { Prisma } from "@/lib/generated/prisma/client";
import { dateToInput, inputToDate } from "@/lib/format";
import type { ExistingTransaction } from "@/lib/import/duplicates";
import {
  firstError,
  importSchema,
  templateSchema,
  type ActionResult,
  type ImportInput,
  type TemplateInput,
} from "@/lib/validation";
import { handleDbError, revalidateAll } from "./shared";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** Existing transactions in a date range, used to flag rows that were already imported. */
export async function findPossibleDuplicates(from: string, to: string): Promise<ExistingTransaction[]> {
  const range = z.object({ from: day, to: day }).safeParse({ from, to });
  if (!range.success) return [];
  const rows = await db.transaction.findMany({
    where: { date: { gte: inputToDate(range.data.from), lte: inputToDate(range.data.to) } },
    select: { id: true, date: true, description: true, amountCents: true, direction: true },
  });
  return rows.map((r) => ({ ...r, date: dateToInput(r.date) }));
}

export async function importTransactions(
  input: ImportInput,
): Promise<{ ok: true; batchId: number; count: number } | { ok: false; error: string }> {
  const parsed = importSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const index = issue?.path[0] === "rows" ? issue.path[1] : undefined;
    return {
      ok: false,
      error: typeof index === "number" ? `Row ${index + 1}: ${issue.message}` : (issue?.message ?? "Invalid input"),
    };
  }
  const { fileName, rows } = parsed.data;
  try {
    const batch = await db.$transaction(async (tx) => {
      const created = await tx.importBatch.create({ data: { fileName } });
      await tx.transaction.createMany({
        data: rows.map(({ amount, date, ...rest }) => ({
          ...rest,
          amountCents: amount,
          date: inputToDate(date),
          importBatchId: created.id,
        })),
      });
      return created;
    });
    revalidateAll();
    return { ok: true, batchId: batch.id, count: rows.length };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2003") {
      return { ok: false, error: "One of the selected categories no longer exists" };
    }
    console.error(e);
    return { ok: false, error: "Something went wrong" };
  }
}

/** Deletes an import batch together with every transaction it created. */
export async function undoImport(batchId: number): Promise<ActionResult> {
  const id = z.number().int().positive().safeParse(batchId);
  if (!id.success) return firstError(id.error);
  try {
    await db.$transaction([
      db.transaction.deleteMany({ where: { importBatchId: id.data } }),
      db.importBatch.delete({ where: { id: id.data } }),
    ]);
  } catch (e) {
    return handleDbError(e, "import");
  }
  revalidateAll();
  return { ok: true };
}

type Failure = Extract<ActionResult, { ok: false }>;

function toTemplateData(input: TemplateInput) {
  const parsed = templateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { config, ...rest } = parsed.data;
  return { ok: true as const, data: { ...rest, config: JSON.stringify(config) } };
}

export async function saveTemplate(
  input: TemplateInput,
): Promise<{ ok: true; id: number } | Failure> {
  const result = toTemplateData(input);
  if (!result.ok) return result;
  try {
    const created = await db.statementTemplate.create({ data: result.data });
    revalidateAll();
    return { ok: true, id: created.id };
  } catch (e) {
    return handleDbError(e, "template") as Failure;
  }
}

export async function updateTemplate(id: number, input: TemplateInput): Promise<ActionResult> {
  const result = toTemplateData(input);
  if (!result.ok) return result;
  try {
    await db.statementTemplate.update({ where: { id }, data: result.data });
  } catch (e) {
    return handleDbError(e, "template");
  }
  revalidateAll();
  return { ok: true };
}

export async function deleteTemplate(id: number): Promise<ActionResult> {
  try {
    await db.statementTemplate.delete({ where: { id } });
  } catch (e) {
    return handleDbError(e, "template");
  }
  revalidateAll();
  return { ok: true };
}
