"use client";

import { RotateCcwIcon } from "lucide-react";
import { CategorySelect, type CategoryOption } from "@/components/category-select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { CategoryMatch } from "@/lib/import/category-match";
import { cn } from "@/lib/utils";

export type SourceCategoryValue = {
  /** Normalized value, the key in the template's categoryMap */
  key: string;
  /** The value as first seen in the file */
  label: string;
  count: number;
  /** A mapping in the config (picked here or loaded from the template) to a category that still exists */
  savedId: number | null;
  match: CategoryMatch | null;
};

const STATUS = {
  saved: { label: "Mapped", className: "border-sky-500 text-sky-700 dark:text-sky-400" },
  exact: { label: "Exact match", className: "border-emerald-500 text-emerald-700 dark:text-emerald-400" },
  close: { label: "Close match", className: "border-amber-500 text-amber-700 dark:text-amber-400" },
  none: { label: "No match", className: "border-rose-400 text-rose-600 dark:text-rose-400" },
};

/** Maps each distinct value from the file's category column to an existing category. */
export function ImportCategoryMap({
  values,
  categories,
  onMap,
  onClear,
}: {
  values: SourceCategoryValue[];
  categories: CategoryOption[];
  onMap: (key: string, categoryId: number) => void;
  onClear: (key: string) => void;
}) {
  const unmatched = values.filter((v) => v.savedId === null && !v.match).length;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Category mapping</CardTitle>
        <CardDescription>
          {values.length} distinct value{values.length === 1 ? "" : "s"} in the file&apos;s category
          column
          {unmatched > 0 && `, ${unmatched} without a match`}. Pick a category to apply it to every row
          with that value. Save or update the template to remember these choices.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="grid gap-2 md:grid-cols-2" aria-label="CSV category mappings">
          {values.map((v) => {
            const categoryId = v.savedId ?? v.match?.categoryId ?? null;
            const status = STATUS[v.savedId !== null ? "saved" : (v.match?.confidence ?? "none")];
            return (
              <li
                key={v.key}
                data-testid="category-mapping"
                className="flex flex-wrap items-center gap-2 rounded-lg border p-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium" title={v.label}>
                    {v.label}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {v.count} row{v.count === 1 ? "" : "s"}
                  </div>
                </div>
                <Badge variant="outline" className={cn("shrink-0", status.className)}>
                  {status.label}
                </Badge>
                <CategorySelect
                  categories={categories}
                  value={categoryId ? String(categoryId) : undefined}
                  onChange={(id) => onMap(v.key, Number(id))}
                  placeholder="Pick a category"
                  className={cn("w-56", categoryId === null && "border-rose-400")}
                />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Reset mapping for ${v.label}`}
                  title="Reset to automatic match"
                  onClick={() => onClear(v.key)}
                  disabled={v.savedId === null}
                >
                  <RotateCcwIcon />
                </Button>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
