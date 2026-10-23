import { Suspense } from "react";
import Link from "next/link";
import { PlusIcon } from "lucide-react";
import { LoadingBlock, PageHeader } from "@/components/page-header";
import { TransactionFilters } from "@/components/transaction-filters";
import { TransactionForm } from "@/components/transaction-form";
import { TransactionsTable } from "@/components/transactions-table";
import { Button } from "@/components/ui/button";
import { centsToInput, dateToInput, formatDay } from "@/lib/format";
import { getAccountOptions, getCategories, getGroups, getTransactions } from "@/lib/queries";

type SearchParams = Awaited<PageProps<"/transactions">["searchParams"]>;

function str(v: SearchParams[string]) {
  return typeof v === "string" ? v : "";
}

export default function TransactionsPage(props: PageProps<"/transactions">) {
  return (
    <>
      <PageHeader title="Transactions" description="Every credit and debit you've recorded.">
        <Suspense>
          <AddButton />
        </Suspense>
      </PageHeader>
      <Suspense fallback={<LoadingBlock />}>
        <TransactionsContent searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}

async function loadCategoryOptions() {
  const categories = await getCategories();
  return categories.map((c) => ({
    id: c.id,
    name: c.name,
    type: c.type,
    groupName: c.group.name,
  }));
}

async function AddButton() {
  const [categories, accounts] = await Promise.all([loadCategoryOptions(), getAccountOptions()]);
  return (
    <TransactionForm
      categories={categories}
      accounts={accounts}
      trigger={
        <Button>
          <PlusIcon /> Add transaction
        </Button>
      }
    />
  );
}

async function TransactionsContent({
  searchParams,
}: Pick<PageProps<"/transactions">, "searchParams">) {
  const sp = await searchParams;
  const filters = {
    from: str(sp.from),
    to: str(sp.to),
    account: str(sp.account) || "all",
    group: str(sp.group) || "all",
    category: str(sp.category) || "all",
    direction: str(sp.direction) || "all",
    q: str(sp.q),
  };
  const direction =
    filters.direction === "CREDIT" || filters.direction === "DEBIT" ? filters.direction : undefined;

  const [categories, groups, accounts, result] = await Promise.all([
    loadCategoryOptions(),
    getGroups(),
    getAccountOptions(),
    getTransactions({
      from: filters.from || undefined,
      to: filters.to || undefined,
      accountId: Number(filters.account) || undefined,
      groupId: Number(filters.group) || undefined,
      categoryId: Number(filters.category) || undefined,
      direction,
      q: filters.q || undefined,
      page: Number(str(sp.page)) || 1,
    }),
  ]);

  const pageHref = (page: number) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(filters)) if (v && v !== "all") params.set(k, v);
    params.set("page", String(page));
    return `/transactions?${params}`;
  };

  return (
    <div className="grid gap-4">
      <TransactionFilters
        key={JSON.stringify(filters)}
        initial={filters}
        categories={categories}
        groups={groups.map((g) => ({ id: g.id, name: g.name }))}
        accounts={accounts}
      />
      <TransactionsTable
        categories={categories}
        accounts={accounts}
        rows={result.rows.map((t) => ({
          id: t.id,
          date: dateToInput(t.date),
          displayDate: formatDay(t.date),
          description: t.description,
          amount: centsToInput(t.amountCents),
          amountCents: t.amountCents,
          direction: t.direction,
          categoryId: t.categoryId,
          accountId: t.accountId,
          accountName: t.account.name,
          isTransfer: t.category.type === "TRANSFER",
        }))}
      />
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {result.total} transaction{result.total === 1 ? "" : "s"}
        </span>
        {result.pageCount > 1 && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link
                href={pageHref(result.page - 1)}
                aria-disabled={result.page <= 1}
                className={result.page <= 1 ? "pointer-events-none opacity-50" : undefined}
              >
                Previous
              </Link>
            </Button>
            <span>
              Page {result.page} of {result.pageCount}
            </span>
            <Button variant="outline" size="sm" asChild>
              <Link
                href={pageHref(result.page + 1)}
                aria-disabled={result.page >= result.pageCount}
                className={
                  result.page >= result.pageCount ? "pointer-events-none opacity-50" : undefined
                }
              >
                Next
              </Link>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
