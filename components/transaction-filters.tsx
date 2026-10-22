"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { CategorySelect, type CategoryOption } from "@/components/category-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type FilterValues = {
  from: string;
  to: string;
  group: string;
  category: string;
  direction: string;
  q: string;
};

const ALL = "all";

export function TransactionFilters({
  initial,
  categories,
  groups,
}: {
  initial: FilterValues;
  categories: CategoryOption[];
  groups: { id: number; name: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [values, setValues] = useState(initial);
  const set = (key: keyof FilterValues, value: string) =>
    setValues((v) => ({ ...v, [key]: value }));

  function apply(next: FilterValues) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(next)) {
      if (v && v !== ALL) params.set(k, v);
    }
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  function clear() {
    const empty = { from: "", to: "", group: ALL, category: ALL, direction: ALL, q: "" };
    setValues(empty);
    apply(empty);
  }

  const visibleCategories =
    values.group === ALL
      ? categories
      : categories.filter((c) => c.groupName === groups.find((g) => String(g.id) === values.group)?.name);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        apply(values);
      }}
      className="grid grid-cols-2 gap-3 rounded-xl border bg-background p-4 md:grid-cols-4 lg:grid-cols-7"
    >
      <Field label="From">
        <Input type="date" value={values.from} onChange={(e) => set("from", e.target.value)} />
      </Field>
      <Field label="To">
        <Input type="date" value={values.to} onChange={(e) => set("to", e.target.value)} />
      </Field>
      <Field label="Group">
        <Select
          value={values.group}
          onValueChange={(v) => setValues((s) => ({ ...s, group: v, category: ALL }))}
        >
          <SelectTrigger className="w-full">
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
      </Field>
      <Field label="Category">
        <CategorySelect
          categories={visibleCategories}
          value={values.category}
          onChange={(v) => set("category", v)}
          allLabel="All categories"
        />
      </Field>
      <Field label="Direction">
        <Select value={values.direction} onValueChange={(v) => set("direction", v)}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Both</SelectItem>
            <SelectItem value="CREDIT">Credit</SelectItem>
            <SelectItem value="DEBIT">Debit</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <Field label="Search">
        <Input
          placeholder="Description"
          value={values.q}
          onChange={(e) => set("q", e.target.value)}
        />
      </Field>
      <div className="col-span-2 flex items-end gap-2 md:col-span-1">
        <Button type="submit" className="flex-1">
          Apply
        </Button>
        <Button type="button" variant="outline" onClick={clear}>
          Clear
        </Button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
