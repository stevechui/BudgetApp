import { Suspense } from "react";
import { ImportHistory } from "@/components/import-history";
import { LoadingBlock, PageHeader } from "@/components/page-header";
import { StatementImporter } from "@/components/statement-importer";
import { getImportBatches, getImportContext } from "@/lib/queries";

export default function ImportPage() {
  return (
    <>
      <PageHeader
        title="Import statement"
        description="Extract transactions from a bank statement PDF, review them, then add them to your budget."
      />
      <div className="grid gap-10">
        <Suspense fallback={<LoadingBlock />}>
          <ImporterContent />
        </Suspense>
        <Suspense>
          <HistoryContent />
        </Suspense>
      </div>
    </>
  );
}

async function ImporterContent() {
  const { accounts, categories, templates, history } = await getImportContext();
  return (
    <StatementImporter
      accounts={accounts}
      categories={categories}
      templates={templates}
      history={history}
    />
  );
}

async function HistoryContent() {
  const batches = await getImportBatches();
  return (
    <ImportHistory
      batches={batches.map((b) => ({
        id: b.id,
        fileName: b.fileName,
        createdAt: b.createdAt.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }),
        count: b._count.transactions,
        accountName: b.accountName,
      }))}
    />
  );
}
