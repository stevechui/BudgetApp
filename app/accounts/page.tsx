import { Suspense } from "react";
import { AccountsTable } from "@/components/accounts-table";
import { LoadingBlock, PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { formatDay } from "@/lib/format";
import { getAccounts } from "@/lib/queries";

export default function AccountsPage() {
  return (
    <>
      <PageHeader
        title="Accounts"
        description="Balance = opening balance + credits − debits. Credit cards show a negative balance while money is owed."
      />
      <Suspense fallback={<LoadingBlock />}>
        <AccountsContent />
      </Suspense>
    </>
  );
}

async function AccountsContent() {
  const accounts = await getAccounts();
  const assets = accounts.reduce((sum, a) => sum + Math.max(0, a.balanceCents), 0);
  const liabilities = accounts.reduce((sum, a) => sum + Math.min(0, a.balanceCents), 0);

  return (
    <div className="grid gap-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Net worth" cents={assets + liabilities} tone="net" />
        <StatCard label="Assets" cents={assets} tone="income" />
        <StatCard label="Owed" cents={-liabilities} tone="expense" />
      </div>
      <AccountsTable
        accounts={accounts.map((a) => ({
          id: a.id,
          name: a.name,
          institution: a.institution,
          type: a.type,
          openingBalanceCents: a.openingBalanceCents,
          balanceCents: a.balanceCents,
          transactionCount: a.transactionCount,
          latestTransactionDate: a.latestTransactionDate ? formatDay(a.latestTransactionDate) : null,
          lastImportDate: a.lastImportDate ? formatDay(a.lastImportDate) : null,
        }))}
      />
    </div>
  );
}
