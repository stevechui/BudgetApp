"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { CategoryOption } from "@/components/category-select";
import { ChevronDownIcon } from "lucide-react";
import type { Show } from "@/components/charts/income-expense-chart";
import type { Period } from "@/lib/report-math";

export type ReportParams = { period: Period; show: Show; from: string; to: string; categories?: string[] };

export function ReportControls({
  initial,
  categories,
}: {
  initial: ReportParams & { custom: boolean; categories: string[] };
  categories: CategoryOption[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [from, setFrom] = useState(initial.custom ? initial.from : "");
  const [to, setTo] = useState(initial.custom ? initial.to : "");
  const [selectedCategories, setSelectedCategories] = useState(initial.categories);
  const [categoryOpen, setCategoryOpen] = useState(false);

  function go(next: Partial<ReportParams> & { from?: string; to?: string; categories?: string[] }) {
    const params = new URLSearchParams();
    params.set("period", next.period ?? initial.period);
    params.set("show", next.show ?? initial.show);
    const f = next.from ?? from;
    const t = next.to ?? to;
    if (f) params.set("from", f);
    if (t) params.set("to", t);
    const selected = next.categories ?? selectedCategories;
    if (selected.length === 0) {
      params.set("categories", "none");
    } else if (selected.length !== categories.length) {
      params.set("categories", selected.join(","));
    }
    router.push(`${pathname}?${params}`);
  }

  return (
    <div className="flex flex-wrap items-end gap-4 rounded-xl border bg-background p-4">
      <div className="grid gap-1.5">
        <Label className="text-xs text-muted-foreground">Period</Label>
        <Tabs value={initial.period} onValueChange={(v) => go({ period: v as Period })}>
          <TabsList>
            <TabsTrigger value="week">Weekly</TabsTrigger>
            <TabsTrigger value="month">Monthly</TabsTrigger>
            <TabsTrigger value="quarter">Quarterly</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <div className="grid gap-1.5">
        <Label className="text-xs text-muted-foreground">Show</Label>
        <Tabs value={initial.show} onValueChange={(v) => go({ show: v as Show })}>
          <TabsList>
            <TabsTrigger value="both">Income &amp; Expense</TabsTrigger>
            <TabsTrigger value="income">Income</TabsTrigger>
            <TabsTrigger value="expense">Expense</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <div className="grid gap-1.5">
        <Label className="text-xs text-muted-foreground">Categories</Label>
        <Popover open={categoryOpen} onOpenChange={setCategoryOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" className="justify-between font-normal">
              <span className="max-w-52 truncate">
                {selectedCategories.length === 0
                  ? "No categories"
                  : selectedCategories.length === categories.length
                    ? "All categories"
                  : `${selectedCategories.length} selected`}
              </span>
              <ChevronDownIcon className="size-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-0" align="start">
            <Command>
              <CommandInput placeholder="Search categories..." />
              <CommandList>
                <CommandEmpty>No matching category.</CommandEmpty>
                <div className="flex gap-2 border-b p-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 flex-1"
                    onClick={() => {
                      const next = categories.map((category) => String(category.id));
                      setSelectedCategories(next);
                      go({ categories: next });
                    }}
                  >
                    All
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 flex-1"
                    onClick={() => {
                      setSelectedCategories([]);
                      go({ categories: [] });
                    }}
                  >
                    None
                  </Button>
                </div>
                {categories.map((category) => {
                  const id = String(category.id);
                  const checked = selectedCategories.includes(id);
                  return (
                    <CommandItem
                      key={category.id}
                      value={`${category.name} ${category.groupName}`}
                      onSelect={() => {
                        const next = checked
                          ? selectedCategories.filter((value) => value !== id)
                          : [...selectedCategories, id];
                        setSelectedCategories(next);
                        go({ categories: next });
                      }}
                    >
                      <span className="mr-2">{checked ? "✓" : ""}</span>
                      {category.name}
                      <span className="ml-auto text-xs text-muted-foreground">{category.groupName}</span>
                    </CommandItem>
                  );
                })}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          go({});
        }}
      >
        <div className="grid gap-1.5">
          <Label className="text-xs text-muted-foreground">From</Label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} placeholder={initial.from} />
        </div>
        <div className="grid gap-1.5">
          <Label className="text-xs text-muted-foreground">To</Label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <Button type="submit">Apply</Button>
        {initial.custom && (
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setFrom("");
              setTo("");
              go({ from: "", to: "" });
            }}
          >
            Reset range
          </Button>
        )}
      </form>
    </div>
  );
}
