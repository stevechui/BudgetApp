"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { inputToDate } from "@/lib/format";
import {
  firstError,
  transactionSchema,
  type ActionResult,
  type TransactionInput,
} from "@/lib/validation";
import { handleDbError, revalidateAll } from "./shared";

function toData(input: TransactionInput) {
  const parsed = transactionSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, result: firstError(parsed.error) };
  const { amount, date, ...rest } = parsed.data;
  return {
    ok: true as const,
    data: { ...rest, amountCents: amount, date: inputToDate(date) },
  };
}

export async function createTransaction(input: TransactionInput): Promise<ActionResult> {
  const result = toData(input);
  if (!result.ok) return result.result;
  try {
    await db.transaction.create({ data: result.data });
  } catch (e) {
    return handleDbError(e, "transaction");
  }
  revalidateAll();
  return { ok: true };
}

export async function updateTransaction(id: number, input: TransactionInput): Promise<ActionResult> {
  const result = toData(input);
  if (!result.ok) return result.result;
  try {
    await db.transaction.update({ where: { id }, data: result.data });
  } catch (e) {
    return handleDbError(e, "transaction");
  }
  revalidateAll();
  return { ok: true };
}

export async function setTransactionCategory(id: number, categoryId: number): Promise<ActionResult> {
  const parsed = z.number().int().positive().safeParse(categoryId);
  if (!parsed.success) return firstError(parsed.error);
  try {
    await db.transaction.update({ where: { id }, data: { categoryId: parsed.data } });
  } catch (e) {
    return handleDbError(e, "transaction");
  }
  revalidateAll();
  return { ok: true };
}

const transactionIdsSchema = z
  .array(z.number().int().positive())
  .min(1, "Select at least one transaction")
  .max(5000, "Select no more than 5,000 transactions")
  .transform((ids) => [...new Set(ids)]);

type BulkActionResult = { ok: true; count: number } | { ok: false; error: string };

function firstBulkError(error: z.ZodError): Extract<BulkActionResult, { ok: false }> {
  return { ok: false, error: error.issues[0]?.message ?? "Invalid input" };
}

export async function setTransactionsCategory(
  ids: number[],
  categoryId: number,
): Promise<BulkActionResult> {
  const parsedIds = transactionIdsSchema.safeParse(ids);
  if (!parsedIds.success) return firstBulkError(parsedIds.error);
  const parsedCategory = z.number().int().positive().safeParse(categoryId);
  if (!parsedCategory.success) return firstBulkError(parsedCategory.error);
  try {
    const result = await db.transaction.updateMany({
      where: { id: { in: parsedIds.data } },
      data: { categoryId: parsedCategory.data },
    });
    revalidateAll();
    return { ok: true, count: result.count };
  } catch (e) {
    return handleDbError(e, "transaction");
  }
}

export async function deleteTransaction(id: number): Promise<ActionResult> {
  try {
    await db.transaction.delete({ where: { id } });
  } catch (e) {
    return handleDbError(e, "transaction");
  }
  revalidateAll();
  return { ok: true };
}

export async function deleteTransactions(
  ids: number[],
): Promise<BulkActionResult> {
  const parsedIds = transactionIdsSchema.safeParse(ids);
  if (!parsedIds.success) return firstBulkError(parsedIds.error);
  try {
    const result = await db.transaction.deleteMany({
      where: { id: { in: parsedIds.data } },
    });
    revalidateAll();
    return { ok: true, count: result.count };
  } catch (e) {
    return handleDbError(e, "transaction");
  }
}
