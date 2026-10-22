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

export async function deleteTransaction(id: number): Promise<ActionResult> {
  try {
    await db.transaction.delete({ where: { id } });
  } catch (e) {
    return handleDbError(e, "transaction");
  }
  revalidateAll();
  return { ok: true };
}
