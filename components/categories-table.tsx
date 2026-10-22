"use client";

import { useMemo, useState } from "react";
import { PencilIcon, PlusIcon } from "lucide-react";
import { CategoryForm } from "@/components/category-form";
import { CategoryTypeBadge } from "@/components/category-type-badge";
import { ConfirmDelete } from "@/components/confirm-delete";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { deleteCategory } from "@/lib/actions/categories";
import type { CategoryType } from "@/lib/generated/prisma/enums";

export type CategoryRow = {
  id: number;
  name: string;
  type: CategoryType;
  groupId: number;
  groupName: string;
  transactionCount: number;
};

const ALL = "all";

export function CategoriesTable({
  categories,
  groups,
  initialGroupId,
}: {
  categories: CategoryRow[];
  groups: { id: number; name: string }[];
  initialGroupId?: number;
}) {
  const [groupFilter, setGroupFilter] = useState(
    initialGroupId ? String(initialGroupId) : ALL,
  );
  const [typeFilter, setTypeFilter] = useState(ALL);

  const grouped = useMemo(() => {
    const filtered = categories.filter(
      (c) =>
        (groupFilter === ALL || String(c.groupId) === groupFilter) &&
        (typeFilter === ALL || c.type === typeFilter),
    );
    const map = new Map<string, CategoryRow[]>();
    for (const c of filtered) {
      const list = map.get(c.groupName) ?? [];
      list.push(c);
      map.set(c.groupName, list);
    }
    return [...map.entries()];
  }, [categories, groupFilter, typeFilter]);

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-wrap gap-4">
          <div className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground">Group</Label>
            <Select value={groupFilter} onValueChange={setGroupFilter}>
              <SelectTrigger className="w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All groups</SelectItem>
                {groups.map((g) => (
                  <SelectItem key={g.id} value={String(g.id)}>
                    {g.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground">Type</Label>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All types</SelectItem>
                <SelectItem value="CREDIT">Credit</SelectItem>
                <SelectItem value="DEBIT">Debit</SelectItem>
                <SelectItem value="TRANSFER">Transfer</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <CategoryForm
          groups={groups}
          defaultGroupId={groupFilter === ALL ? undefined : Number(groupFilter)}
          trigger={
            <Button disabled={groups.length === 0}>
              <PlusIcon /> New category
            </Button>
          }
        />
      </div>

      <div className="rounded-xl border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Transactions</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {grouped.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                  No categories match.
                </TableCell>
              </TableRow>
            )}
            {grouped.map(([groupName, rows]) => (
              <GroupRows
                key={groupName}
                groupName={groupName}
                rows={rows}
                groups={groups}
                allCategories={categories}
              />
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function GroupRows({
  groupName,
  rows,
  groups,
  allCategories,
}: {
  groupName: string;
  rows: CategoryRow[];
  groups: { id: number; name: string }[];
  allCategories: CategoryRow[];
}) {
  return (
    <>
      <TableRow className="bg-muted/50 hover:bg-muted/50">
        <TableCell colSpan={4} className="py-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          {groupName}
        </TableCell>
      </TableRow>
      {rows.map((c) => (
        <TableRow key={c.id}>
          <TableCell className="pl-6 font-medium">{c.name}</TableCell>
          <TableCell>
            <CategoryTypeBadge type={c.type} />
          </TableCell>
          <TableCell className="text-right tabular-nums text-muted-foreground">
            {c.transactionCount}
          </TableCell>
          <TableCell>
            <div className="flex justify-end gap-1">
              <CategoryForm
                category={c}
                groups={groups}
                trigger={
                  <Button variant="ghost" size="icon-sm" aria-label="Edit">
                    <PencilIcon />
                  </Button>
                }
              />
              <DeleteCategory category={c} allCategories={allCategories} />
            </div>
          </TableCell>
        </TableRow>
      ))}
    </>
  );
}

function DeleteCategory({
  category,
  allCategories,
}: {
  category: CategoryRow;
  allCategories: CategoryRow[];
}) {
  const [target, setTarget] = useState<string>();
  const inUse = category.transactionCount > 0;
  const others = allCategories.filter((c) => c.id !== category.id);

  return (
    <ConfirmDelete
      title={`Delete "${category.name}"?`}
      description={
        inUse
          ? `${category.transactionCount} transaction${category.transactionCount === 1 ? " uses" : "s use"} this category. Choose a category to move them to before deleting.`
          : "This cannot be undone."
      }
      disabled={inUse && !target}
      onConfirm={() => deleteCategory(category.id, target ? Number(target) : undefined)}
    >
      {inUse && (
        <div className="grid gap-2">
          <Label>Move transactions to</Label>
          <Select value={target} onValueChange={setTarget}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select a category" />
            </SelectTrigger>
            <SelectContent>
              {others.map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>
                  {c.name} ({c.groupName})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </ConfirmDelete>
  );
}
