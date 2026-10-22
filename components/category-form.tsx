"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createCategory, updateCategory } from "@/lib/actions/categories";
import { CATEGORY_TYPE_LABELS } from "@/lib/format";
import type { CategoryType } from "@/lib/generated/prisma/enums";

type CategoryValue = { id: number; name: string; type: CategoryType; groupId: number };

export function CategoryForm({
  category,
  groups,
  defaultGroupId,
  trigger,
}: {
  category?: CategoryValue;
  groups: { id: number; name: string }[];
  defaultGroupId?: number;
  trigger: React.ReactNode;
}) {
  const initial = () => ({
    name: category?.name ?? "",
    type: category?.type ?? ("DEBIT" as CategoryType),
    groupId: category?.groupId ?? defaultGroupId ?? groups[0]?.id ?? 0,
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
      const res = category
        ? await updateCategory(category.id, values)
        : await createCategory(values);
      if (res.ok) {
        toast.success(category ? "Category updated" : "Category created");
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
            <DialogTitle>{category ? "Edit category" : "New category"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="category-name">Name</Label>
            <Input
              id="category-name"
              value={values.name}
              onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
              autoFocus
              required
            />
          </div>
          <div className="grid gap-2">
            <Label>Type</Label>
            <Select
              value={values.type}
              onValueChange={(type) => setValues((v) => ({ ...v, type: type as CategoryType }))}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(CATEGORY_TYPE_LABELS) as CategoryType[]).map((t) => (
                  <SelectItem key={t} value={t}>
                    {CATEGORY_TYPE_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>Category group</Label>
            <Select
              value={values.groupId ? String(values.groupId) : undefined}
              onValueChange={(id) => setValues((v) => ({ ...v, groupId: Number(id) }))}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a group" />
              </SelectTrigger>
              <SelectContent>
                {groups.map((g) => (
                  <SelectItem key={g.id} value={String(g.id)}>
                    {g.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
