"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createAccount, updateAccount } from "@/lib/actions/accounts";
import { ACCOUNT_TYPE_LABELS, centsToInput } from "@/lib/format";
import type { AccountType } from "@/lib/generated/prisma/enums";

export type AccountValue = {
  id: number;
  name: string;
  institution: string | null;
  type: AccountType;
  openingBalanceCents: number;
};

export function AccountForm({
  account,
  trigger,
}: {
  account?: AccountValue;
  trigger: React.ReactNode;
}) {
  const initial = () => ({
    name: account?.name ?? "",
    institution: account?.institution ?? "",
    type: account?.type ?? ("CHECKING" as AccountType),
    openingBalance: centsToInput(account?.openingBalanceCents ?? 0),
  });
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState(initial);
  const [pending, startTransition] = useTransition();

  function onOpenChange(next: boolean) {
    if (next) setValues(initial());
    setOpen(next);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = account ? await updateAccount(account.id, values) : await createAccount(values);
      if (res.ok) {
        toast.success(account ? "Account updated" : "Account created");
        setOpen(false);
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{account ? "Edit account" : "New account"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="account-name">Name</Label>
            <Input
              id="account-name"
              placeholder="e.g. Wells Fargo Checking"
              value={values.name}
              onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
              autoFocus
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="account-institution">Institution (optional)</Label>
            <Input
              id="account-institution"
              placeholder="e.g. Wells Fargo"
              value={values.institution}
              onChange={(e) => setValues((v) => ({ ...v, institution: e.target.value }))}
            />
          </div>
          <div className="grid gap-2">
            <Label>Type</Label>
            <Select
              value={values.type}
              onValueChange={(type) => setValues((v) => ({ ...v, type: type as AccountType }))}
            >
              <SelectTrigger className="w-full" aria-label="Account type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(ACCOUNT_TYPE_LABELS) as AccountType[]).map((t) => (
                  <SelectItem key={t} value={t}>
                    {ACCOUNT_TYPE_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="account-opening">Opening balance</Label>
            <Input
              id="account-opening"
              inputMode="decimal"
              value={values.openingBalance}
              onChange={(e) => setValues((v) => ({ ...v, openingBalance: e.target.value }))}
              required
            />
            <DialogDescription className="text-xs">
              The balance before your first recorded transaction. Use a negative amount for money
              owed, like a credit card balance.
            </DialogDescription>
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
