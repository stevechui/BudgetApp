import { z } from "zod";

const name = z.string().trim().min(1, "Name is required").max(80, "Name is too long");
const id = z.coerce.number().int().positive();

export const groupSchema = z.object({ name });

export const categorySchema = z.object({
  name,
  type: z.enum(["CREDIT", "DEBIT", "TRANSFER"], { message: "Pick a type" }),
  groupId: id,
});

export const transactionSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date"),
  description: z.string().trim().min(1, "Description is required").max(200),
  amount: z
    .string()
    .trim()
    .regex(/^\d+(\.\d{1,2})?$/, "Enter a positive amount, e.g. 12.34")
    .transform((v) => Math.round(Number(v) * 100))
    .refine((cents) => cents > 0, "Amount must be greater than 0"),
  direction: z.enum(["CREDIT", "DEBIT"], { message: "Pick credit or debit" }),
  categoryId: id,
  accountId: z.coerce.number({ message: "Pick an account" }).int().positive("Pick an account"),
});

export const ACCOUNT_TYPES = [
  "CHECKING",
  "SAVINGS",
  "CREDIT_CARD",
  "CASH",
  "INVESTMENT",
  "OTHER",
] as const;

export const accountSchema = z.object({
  name,
  institution: z
    .string()
    .trim()
    .max(80, "Institution is too long")
    .transform((v) => v || null),
  type: z.enum(ACCOUNT_TYPES, { message: "Pick an account type" }),
  openingBalance: z
    .string()
    .trim()
    .regex(/^-?\d+(\.\d{1,2})?$/, "Enter an amount, e.g. 1250.00 or -300")
    .transform((v) => Math.round(Number(v) * 100)),
});

/** An imported row; the account is chosen once for the whole batch. */
export const importRowSchema = transactionSchema.omit({ accountId: true });

export const importSchema = z.object({
  fileName: z.string().trim().min(1).max(200),
  accountId: z.coerce.number({ message: "Pick an account" }).int().positive("Pick an account"),
  rows: z.array(importRowSchema).min(1, "Select at least one row to import").max(5000),
});

const columnSchema = z.object({
  label: z.string().max(80),
  kind: z.enum(["text", "money"]),
  role: z.enum(["date", "description", "debit", "credit", "amount", "balance", "ignore"]),
  x0: z.number(),
  x1: z.number(),
});

export const templateConfigSchema = z.object({
  columns: z.array(columnSchema).max(20).nullable(),
  dateFormat: z.enum(["auto", "MDY", "DMY"]),
  signMode: z.enum(["auto", "columns", "signed", "suffix"]),
  flipDirection: z.boolean(),
  skipPatterns: z.array(z.string().trim().min(1).max(100)).max(50),
});

export const templateSchema = z.object({
  name,
  fingerprint: z
    .string()
    .trim()
    .min(3, "Enter some text that appears on this bank's statements")
    .max(200),
  config: templateConfigSchema,
  accountId: id.nullable().optional(),
});

export type GroupInput = z.input<typeof groupSchema>;
export type AccountInput = z.input<typeof accountSchema>;
export type ImportInput = z.input<typeof importSchema>;
export type TemplateInput = z.input<typeof templateSchema>;
export type CategoryInput = z.input<typeof categorySchema>;
export type TransactionInput = z.input<typeof transactionSchema>;

export type ActionResult = { ok: true } | { ok: false; error: string };

export function firstError(error: z.ZodError): ActionResult {
  return { ok: false, error: error.issues[0]?.message ?? "Invalid input" };
}
