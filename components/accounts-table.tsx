"use client";

import { useState } from "react";
import Link from "next/link";
import { PencilIcon, PlusIcon } from "lucide-react";
import { AccountForm, type AccountValue } from "@/components/account-form";
import { AccountSelect } from "@/components/account-select";
import { ConfirmDelete } from "@/components/confirm-delete";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { deleteAccount } from "@/lib/actions/accounts";
import { ACCOUNT_TYPE_LABELS, formatCents } from "@/lib/format";
import type { AccountType } from "@/lib/generated/prisma/enums";
import { cn } from "@/lib/utils";

export type AccountRow = AccountValue & { balanceCents: number; transactionCount: number };

export function AccountsTable({ accounts }: { accounts: AccountRow[] }) {
  const grouped = (Object.keys(ACCOUNT_TYPE_LABELS) as AccountType[])
    .map((type) => [type, accounts.filter((a) => a.type === type)] as const)
    .filter(([, rows]) => rows.length > 0);

  return (
    <div className="grid gap-4">
      <div className="flex justify-end">
        <AccountForm
          trigger={
            <Button>
              <PlusIcon /> New account
            </Button>
          }
        />
      </div>
      <div className="rounded-xl border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Institution</TableHead>
              <TableHead className="text-right">Transactions</TableHead>
              <TableHead className="text-right">Balance</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {grouped.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  No accounts yet.
                </TableCell>
              </TableRow>
            )}
            {grouped.map(([type, rows]) => (
              <TypeRows key={type} type={type} rows={rows} allAccounts={accounts} />
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function TypeRows({
  type,
  rows,
  allAccounts,
}: {
  type: AccountType;
  rows: AccountRow[];
  allAccounts: AccountRow[];
}) {
  const subtotal = rows.reduce((sum, a) => sum + a.balanceCents, 0);
  return (
    <>
      <TableRow className="bg-muted/50 hover:bg-muted/50">
        <TableCell
          colSpan={3}
          className="py-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase"
        >
          {ACCOUNT_TYPE_LABELS[type]}
        </TableCell>
        <TableCell className="py-1.5 text-right text-xs font-semibold text-muted-foreground tabular-nums">
          {formatCents(subtotal)}
        </TableCell>
        <TableCell />
      </TableRow>
      {rows.map((a) => (
        <TableRow key={a.id}>
          <TableCell className="pl-6 font-medium">
            <Link href={`/transactions?account=${a.id}`} className="hover:underline">
              {a.name}
            </Link>
          </TableCell>
          <TableCell className="text-muted-foreground">{a.institution ?? "—"}</TableCell>
          <TableCell className="text-right tabular-nums text-muted-foreground">
            {a.transactionCount}
          </TableCell>
          <TableCell
            className={cn(
              "text-right font-medium tabular-nums",
              a.balanceCents < 0 && "text-rose-600 dark:text-rose-400",
            )}
          >
            {formatCents(a.balanceCents)}
          </TableCell>
          <TableCell>
            <div className="flex justify-end gap-1">
              <AccountForm
                account={a}
                trigger={
                  <Button variant="ghost" size="icon-sm" aria-label="Edit">
                    <PencilIcon />
                  </Button>
                }
              />
              <DeleteAccount account={a} allAccounts={allAccounts} />
            </div>
          </TableCell>
        </TableRow>
      ))}
    </>
  );
}

function DeleteAccount({ account, allAccounts }: { account: AccountRow; allAccounts: AccountRow[] }) {
  const [target, setTarget] = useState<string>();
  const inUse = account.transactionCount > 0;
  const others = allAccounts.filter((a) => a.id !== account.id);

  return (
    <ConfirmDelete
      title={`Delete "${account.name}"?`}
      description={
        !inUse
          ? "This cannot be undone."
          : others.length === 0
            ? `This account has ${account.transactionCount} transaction${account.transactionCount === 1 ? "" : "s"}. Create another account to move them to first.`
            : `This account has ${account.transactionCount} transaction${account.transactionCount === 1 ? "" : "s"}. Choose an account to move them to before deleting.`
      }
      disabled={inUse && !target}
      onConfirm={() => deleteAccount(account.id, target ? Number(target) : undefined)}
    >
      {inUse && others.length > 0 && (
        <div className="grid gap-2">
          <Label>Move transactions to</Label>
          <AccountSelect accounts={others} value={target} onChange={setTarget} />
        </div>
      )}
    </ConfirmDelete>
  );
}
