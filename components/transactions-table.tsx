"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PencilIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import type { AccountOption } from "@/components/account-select";
import { CategorySelect, type CategoryOption } from "@/components/category-select";
import { ConfirmDelete } from "@/components/confirm-delete";
import { Money } from "@/components/money";
import { TransactionForm, type TransactionValue } from "@/components/transaction-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  deleteTransaction,
  deleteTransactions,
  setTransactionCategory,
  setTransactionsCategory,
} from "@/lib/actions/transactions";

export type TransactionRow = TransactionValue & {
  amountCents: number;
  displayDate: string;
  accountName: string;
  isTransfer: boolean;
};

export function TransactionsTable({
  rows,
  categories,
  accounts,
}: {
  rows: TransactionRow[];
  categories: CategoryOption[];
  accounts: AccountOption[];
}) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set());
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [bulkPending, startBulkTransition] = useTransition();
  const rowIds = useMemo(() => new Set(rows.map((row) => row.id)), [rows]);
  const selectedOnPage = rows.filter((row) => selectedIds.has(row.id)).length;
  const allSelected = rows.length > 0 && selectedOnPage === rows.length;

  function toggleAll(include: boolean) {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      for (const id of rowIds) {
        if (include) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }

  function updateSelectedCategory(categoryId: string) {
    const ids = [...selectedIds].filter((id) => rowIds.has(id));
    startBulkTransition(async () => {
      const result = await setTransactionsCategory(ids, Number(categoryId));
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`Updated category for ${result.count} transaction${result.count === 1 ? "" : "s"}`);
      setSelectedIds(new Set());
      router.refresh();
    });
  }

  function confirmDeleteSelected() {
    const ids = [...selectedIds].filter((id) => rowIds.has(id));
    startBulkTransition(async () => {
      const result = await deleteTransactions(ids);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`Deleted ${result.count} transaction${result.count === 1 ? "" : "s"}`);
      setDeleteOpen(false);
      setSelectedIds(new Set());
      router.refresh();
    });
  }

  return (
    <div className="grid gap-3">
      {selectedOnPage > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-auto text-sm text-muted-foreground">
            {selectedOnPage} selected
          </span>
          <CategorySelect
            categories={categories}
            value=""
            onChange={updateSelectedCategory}
            placeholder="Update category"
            className="w-56"
            disabled={bulkPending}
          />
          <Button
            variant="destructive"
            onClick={() => setDeleteOpen(true)}
            disabled={bulkPending}
          >
            <Trash2Icon /> Delete selected
          </Button>
          <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Delete selected transactions?</DialogTitle>
                <DialogDescription>
                  This will permanently delete {selectedOnPage} selected transaction
                  {selectedOnPage === 1 ? "" : "s"}. This action cannot be undone.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setDeleteOpen(false)}
                  disabled={bulkPending}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={confirmDeleteSelected}
                  disabled={bulkPending}
                >
                  {bulkPending ? "Deleting..." : "Delete transactions"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      )}
      <div className="rounded-xl border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <input
                  type="checkbox"
                  aria-label="Select all transactions on this page"
                  className="size-4 accent-primary"
                  checked={allSelected}
                  onChange={(event) => toggleAll(event.target.checked)}
                />
              </TableHead>
              <TableHead className="w-32">Date</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="w-44">Account</TableHead>
              <TableHead className="w-60">Category</TableHead>
              <TableHead className="w-32 text-right">Amount</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                  No transactions found.
                </TableCell>
              </TableRow>
            )}
            {rows.map((t) => (
              <TableRow key={t.id}>
                <TableCell>
                  <input
                    type="checkbox"
                    aria-label={`Select ${t.description}`}
                    className="size-4 accent-primary"
                    checked={selectedIds.has(t.id)}
                    onChange={(event) =>
                      setSelectedIds((previous) => {
                        const next = new Set(previous);
                        if (event.target.checked) next.add(t.id);
                        else next.delete(t.id);
                        return next;
                      })
                    }
                  />
                </TableCell>
                <TableCell className="text-muted-foreground">{t.displayDate}</TableCell>
                <TableCell className="max-w-72 truncate font-medium">{t.description}</TableCell>
                <TableCell className="max-w-44 truncate text-muted-foreground">
                  {t.accountName}
                </TableCell>
                <TableCell>
                  <InlineCategory transaction={t} categories={categories} />
                </TableCell>
                <TableCell className="text-right">
                  <Money
                    cents={t.amountCents}
                    direction={t.direction}
                    className={t.isTransfer ? "text-muted-foreground" : undefined}
                  />
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    <TransactionForm
                      transaction={t}
                      categories={categories}
                      accounts={accounts}
                      trigger={
                        <Button variant="ghost" size="icon-sm" aria-label="Edit">
                          <PencilIcon />
                        </Button>
                      }
                    />
                    <ConfirmDelete
                      title="Delete transaction?"
                      description={`"${t.description}" on ${t.displayDate} will be permanently removed.`}
                      onConfirm={() => deleteTransaction(t.id)}
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

function InlineCategory({
  transaction,
  categories,
}: {
  transaction: TransactionRow;
  categories: CategoryOption[];
}) {
  const [pending, startTransition] = useTransition();
  return (
    <CategorySelect
      size="sm"
      categories={categories}
      value={String(transaction.categoryId)}
      disabled={pending}
      onChange={(value) =>
        startTransition(async () => {
          const res = await setTransactionCategory(transaction.id, Number(value));
          if (res.ok) toast.success("Category updated");
          else toast.error(res.error);
        })
      }
    />
  );
}
