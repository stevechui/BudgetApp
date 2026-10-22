import { Suspense } from "react";
import { CategoriesTable } from "@/components/categories-table";
import { LoadingBlock, PageHeader } from "@/components/page-header";
import { getCategories, getGroups } from "@/lib/queries";

export default function CategoriesPage(props: PageProps<"/categories">) {
  return (
    <>
      <PageHeader
        title="Categories"
        description="Credit categories count as income, debit as expense, and transfers are excluded from budget totals."
      />
      <Suspense fallback={<LoadingBlock />}>
        <CategoriesContent searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}

async function CategoriesContent({
  searchParams,
}: Pick<PageProps<"/categories">, "searchParams">) {
  const { group } = await searchParams;
  const [categories, groups] = await Promise.all([getCategories(), getGroups()]);
  const initialGroupId = Number(group) || undefined;

  return (
    <CategoriesTable
      key={initialGroupId ?? "all"}
      initialGroupId={initialGroupId}
      groups={groups.map((g) => ({ id: g.id, name: g.name }))}
      categories={categories.map((c) => ({
        id: c.id,
        name: c.name,
        type: c.type,
        groupId: c.groupId,
        groupName: c.group.name,
        transactionCount: c._count.transactions,
      }))}
    />
  );
}
