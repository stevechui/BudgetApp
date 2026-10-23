"use client";

import { ConfirmDelete } from "@/components/confirm-delete";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { undoImport } from "@/lib/actions/import";

export type ImportBatchRow = {
  id: number;
  fileName: string;
  createdAt: string;
  count: number;
  accountName: string | null;
};

export function ImportHistory({ batches }: { batches: ImportBatchRow[] }) {
  if (batches.length === 0) return null;
  return (
    <div className="grid gap-2">
      <h2 className="text-lg font-semibold">Import history</h2>
      <div className="rounded-xl border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>File</TableHead>
              <TableHead className="w-48">Account</TableHead>
              <TableHead className="w-48">Imported</TableHead>
              <TableHead className="w-32 text-right">Transactions</TableHead>
              <TableHead className="w-16" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {batches.map((b) => (
              <TableRow key={b.id}>
                <TableCell className="font-medium">{b.fileName}</TableCell>
                <TableCell className="text-muted-foreground">{b.accountName ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">{b.createdAt}</TableCell>
                <TableCell className="text-right tabular-nums">{b.count}</TableCell>
                <TableCell>
                  <div className="flex justify-end">
                    <ConfirmDelete
                      title={`Undo import of "${b.fileName}"?`}
                      description={`This deletes the ${b.count} transaction${b.count === 1 ? "" : "s"} created by this import. Transactions you added by hand are not affected.`}
                      onConfirm={undoImport.bind(null, b.id)}
                    />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
