import "server-only";
import { connection } from "next/server";
import { db } from "@/lib/db";
import type { Direction, Prisma } from "@/lib/generated/prisma/client";
import { inputToDate } from "@/lib/format";
import { normalizeDescription } from "@/lib/import/suggest";
import { templateConfigSchema } from "@/lib/validation";
import { withBalances } from "@/lib/account-math";

export async function getGroups() {
  await connection();
  return db.categoryGroup.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { categories: true } } },
  });
}

export async function getCategories() {
  await connection();
  return db.category.findMany({
    orderBy: [{ group: { name: "asc" } }, { name: "asc" }],
    include: { group: true, _count: { select: { transactions: true } } },
  });
}

/** Accounts ordered by name, each with its current balance and transaction count. */
export async function getAccounts() {
  await connection();
  const [accounts, totals] = await Promise.all([
    db.account.findMany({ orderBy: { name: "asc" } }),
    db.transaction.groupBy({
      by: ["accountId", "direction"],
      _sum: { amountCents: true },
      _count: { _all: true },
    }),
  ]);
  return withBalances(
    accounts,
    totals.map((t) => ({
      accountId: t.accountId,
      direction: t.direction,
      amountCents: t._sum.amountCents ?? 0,
      count: t._count._all,
    })),
  );
}

export async function getAccountOptions() {
  await connection();
  return db.account.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, type: true },
  });
}

export type TransactionFilters = {
  from?: string;
  to?: string;
  accountId?: number;
  categoryId?: number;
  groupId?: number;
  direction?: Direction;
  q?: string;
  page?: number;
};

export const PAGE_SIZE = 50;

export async function getTransactions(filters: TransactionFilters) {
  await connection();
  const where: Prisma.TransactionWhereInput = {};
  if (filters.from || filters.to) {
    where.date = {
      ...(filters.from && { gte: inputToDate(filters.from) }),
      ...(filters.to && { lte: inputToDate(filters.to) }),
    };
  }
  if (filters.accountId) where.accountId = filters.accountId;
  if (filters.categoryId) where.categoryId = filters.categoryId;
  if (filters.groupId) where.category = { groupId: filters.groupId };
  if (filters.direction) where.direction = filters.direction;
  if (filters.q) where.description = { contains: filters.q };

  const page = Math.max(1, filters.page ?? 1);
  const [rows, total] = await Promise.all([
    db.transaction.findMany({
      where,
      orderBy: [{ date: "desc" }, { id: "desc" }],
      include: { category: { include: { group: true } }, account: true },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    db.transaction.count({ where }),
  ]);
  return { rows, total, page, pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

/** Categories, saved templates and categorization history for the statement importer. */
export async function getImportContext() {
  await connection();
  const [accounts, categories, templates, history] = await Promise.all([
    getAccountOptions(),
    getCategories(),
    db.statementTemplate.findMany({ orderBy: { name: "asc" } }),
    db.transaction.findMany({
      orderBy: [{ date: "desc" }, { id: "desc" }],
      select: { description: true, categoryId: true },
      take: 5000,
    }),
  ]);

  const historyMap = new Map<string, number>();
  for (const t of history) {
    const key = normalizeDescription(t.description);
    if (key && !historyMap.has(key)) historyMap.set(key, t.categoryId);
  }

  return {
    accounts,
    categories: categories.map((c) => ({
      id: c.id,
      name: c.name,
      type: c.type,
      groupName: c.group.name,
    })),
    templates: templates.flatMap((t) => {
      let raw: unknown = null;
      try {
        raw = JSON.parse(t.config);
      } catch {}
      const config = templateConfigSchema.safeParse(raw);
      return config.success
        ? [
            {
              id: t.id,
              name: t.name,
              fingerprint: t.fingerprint,
              accountId: t.accountId,
              config: config.data,
            },
          ]
        : [];
    }),
    history: [...historyMap.entries()],
  };
}

export async function getImportBatches() {
  await connection();
  const batches = await db.importBatch.findMany({
    orderBy: { createdAt: "desc" },
    take: 20,
    include: {
      _count: { select: { transactions: true } },
      transactions: { take: 1, select: { account: { select: { name: true } } } },
    },
  });
  return batches.map(({ transactions, ...b }) => ({
    ...b,
    accountName: transactions[0]?.account.name ?? null,
  }));
}

export async function getRecentTransactions(take = 10) {
  await connection();
  return db.transaction.findMany({
    orderBy: [{ date: "desc" }, { id: "desc" }],
    include: { category: true },
    take,
  });
}
