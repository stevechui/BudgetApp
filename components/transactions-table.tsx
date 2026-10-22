"use client";

import { useTransition } from "react";
import { PencilIcon } from "lucide-react";
import { toast } from "sonner";
import { CategorySelect, type CategoryOption } from "@/components/category-select";
import { ConfirmDelete } from "@/components/confirm-delete";
import { Money } from "@/components/money";
import { TransactionForm, type TransactionValue } from "@/components/transaction-form";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { deleteTransaction, setTransactionCategory } from "@/lib/actions/transactions";

export type TransactionRow = TransactionValue & {
  amountCents: number;
  displayDate: string;
  isTransfer: boolean;
};

export function TransactionsTable({
  rows,
  categories,
}: {
  rows: TransactionRow[];
  categories: CategoryOption[];
}) {
  return (
    <div className="rounded-xl border bg-background">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-32">Date</TableHead>
            <TableHead>Description</TableHead>
            <TableHead className="w-60">Category</TableHead>
            <TableHead className="w-32 text-right">Amount</TableHead>
            <TableHead className="w-24" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                No transactions found.
              </TableCell>
            </TableRow>
          )}
          {rows.map((t) => (
            <TableRow key={t.id}>
              <TableCell className="text-muted-foreground">{t.displayDate}</TableCell>
              <TableCell className="max-w-72 truncate font-medium">{t.description}</TableCell>
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
