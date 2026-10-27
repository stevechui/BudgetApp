import { Suspense } from "react";
import Link from "next/link";
import { ImportHistory } from "@/components/import-history";
import { LoadingBlock, PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { getImportBatches } from "@/lib/queries";

export default function ImportHistoryPage() {
  return (
    <>
      <PageHeader title="Import history" description="All statement imports and their transactions.">
        <Button variant="outline" asChild>
          <Link href="/import">Back to import</Link>
        </Button>
      </PageHeader>
      <Suspense fallback={<LoadingBlock />}>
        <AllHistory />
      </Suspense>
    </>
  );
}

async function AllHistory() {
  const batches = await getImportBatches(true);
  return (
    <ImportHistory
      showEmpty
      batches={batches.map((batch) => ({
        id: batch.id,
        fileName: batch.fileName,
        createdAt: batch.createdAt.toLocaleString("en-US", {
          dateStyle: "medium",
          timeStyle: "short",
        }),
        count: batch._count.transactions,
        accountName: batch.accountName,
      }))}
    />
  );
}
