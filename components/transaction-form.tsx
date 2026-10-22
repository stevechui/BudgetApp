"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { CategorySelect, type CategoryOption } from "@/components/category-select";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { createTransaction, updateTransaction } from "@/lib/actions/transactions";
import type { TransactionInput } from "@/lib/validation";

export type TransactionValue = {
  id: number;
  date: string;
  description: string;
  amount: string;
  direction: "CREDIT" | "DEBIT";
  categoryId: number;
};

function today() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function TransactionForm({
  transaction,
  categories,
  trigger,
}: {
  transaction?: TransactionValue;
  categories: CategoryOption[];
  trigger: React.ReactNode;
}) {
  const initial = (): TransactionInput => ({
    date: transaction?.date ?? today(),
    description: transaction?.description ?? "",
    amount: transaction?.amount ?? "",
    direction: transaction?.direction ?? "DEBIT",
    categoryId: transaction?.categoryId ?? 0,
  });
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState(initial);
  const [pending, startTransition] = useTransition();

  function onOpenChange(next: boolean) {
    if (next) setValues(initial());
    setOpen(next);
  }

  function set<K extends keyof TransactionInput>(key: K, value: TransactionInput[K]) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  function onCategoryChange(id: string) {
    const category = categories.find((c) => c.id === Number(id));
    setValues((v) => ({
      ...v,
      categoryId: Number(id),
      // New transactions follow the category's natural direction
      ...(!transaction && category && category.type !== "TRANSFER"
        ? { direction: category.type }
        : {}),
    }));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!values.categoryId) {
      toast.error("Pick a category");
      return;
    }
    startTransition(async () => {
      const res = transaction
        ? await updateTransaction(transaction.id, values)
        : await createTransaction(values);
      if (res.ok) {
        toast.success(transaction ? "Transaction updated" : "Transaction added");
        setOpen(false);
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{transaction ? "Edit transaction" : "New transaction"}</DialogTitle>
          </DialogHeader>
          <Tabs
            value={values.direction}
            onValueChange={(d) => set("direction", d as "CREDIT" | "DEBIT")}
          >
            <TabsList className="w-full">
              <TabsTrigger value="DEBIT">Debit (money out)</TabsTrigger>
              <TabsTrigger value="CREDIT">Credit (money in)</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="tx-date">Date</Label>
              <Input
                id="tx-date"
                type="date"
                value={values.date}
                onChange={(e) => set("date", e.target.value)}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="tx-amount">Amount</Label>
              <Input
                id="tx-amount"
                inputMode="decimal"
                placeholder="0.00"
                value={values.amount}
                onChange={(e) => set("amount", e.target.value)}
                required
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="tx-description">Description</Label>
            <Input
              id="tx-description"
              value={values.description}
              onChange={(e) => set("description", e.target.value)}
              required
            />
          </div>
          <div className="grid gap-2">
            <Label>Category</Label>
            <CategorySelect
              categories={categories}
              value={values.categoryId ? String(values.categoryId) : undefined}
              onChange={onCategoryChange}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
