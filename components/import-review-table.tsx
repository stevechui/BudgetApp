"use client";

import { AlertTriangleIcon, CopyIcon, FileSpreadsheetIcon, SparklesIcon, Trash2Icon } from "lucide-react";
import { CategorySelect, type CategoryOption } from "@/components/category-select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { formatDay, inputToDate } from "@/lib/format";
import type { ReviewRow, RowEdit } from "@/lib/import/review";
import { cn } from "@/lib/utils";

export function ImportReviewTable({
  rows,
  categories,
  onEdit,
  onCategory,
  onDelete,
  onToggleAll,
}: {
  rows: ReviewRow[];
  categories: CategoryOption[];
  onEdit: (key: string, edit: RowEdit) => void;
  /** Category changes may also be applied to rows with similar descriptions */
  onCategory: (key: string, categoryId: string) => void;
  onDelete: (key: string) => void;
  onToggleAll: (include: boolean) => void;
}) {
  const allIncluded = rows.length > 0 && rows.every((r) => r.include);
  return (
    <div className="rounded-xl border bg-background">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">
              <input
                type="checkbox"
                aria-label="Include all rows"
                className="size-4 accent-primary"
                checked={allIncluded}
                onChange={(e) => onToggleAll(e.target.checked)}
              />
            </TableHead>
            <TableHead className="w-40">Date</TableHead>
            <TableHead className="min-w-80">Description</TableHead>
            <TableHead className="w-32">Amount</TableHead>
            <TableHead className="w-28">Direction</TableHead>
            <TableHead className="w-60">Category</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                No rows to show.
              </TableCell>
            </TableRow>
          )}
          {rows.map((r) => {
            const problems = r.include ? r.errors : [];
            const selectedAmountCandidate = r.amountCandidates.findIndex(
              (candidate) => candidate.amount === r.amount && candidate.direction === r.direction,
            );
            return (
              <TableRow
                key={r.key}
                className={cn(
                  "align-top",
                  !r.include && "opacity-50",
                  problems.length > 0
                    ? "bg-rose-50/60 dark:bg-rose-950/20"
                    : r.amountCandidates.length > 1 && "bg-amber-50/70 dark:bg-amber-950/20",
                )}
              >
                <TableCell className="pt-3">
                  <input
                    type="checkbox"
                    aria-label="Include row"
                    className="size-4 accent-primary"
                    checked={r.include}
                    onChange={(e) => onEdit(r.key, { include: e.target.checked })}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    type="date"
                    value={r.date}
                    onChange={(e) => onEdit(r.key, { date: e.target.value })}
                    aria-invalid={r.include && !r.date}
                  />
                </TableCell>
                <TableCell className="min-w-80 whitespace-normal">
                  <Input
                    value={r.description}
                    onChange={(e) => onEdit(r.key, { description: e.target.value })}
                    aria-invalid={r.include && !r.description.trim()}
                  />
                  <RowNotes row={r} problems={problems} />
                </TableCell>
                <TableCell>
                  <Input
                    inputMode="decimal"
                    className="text-right tabular-nums"
                    value={r.amount}
                    placeholder="0.00"
                    onChange={(e) => onEdit(r.key, { amount: e.target.value })}
                    aria-invalid={r.include && r.amountCents <= 0}
                  />
                  {r.amountCandidates.length > 1 && (
                    <Select
                      value={selectedAmountCandidate >= 0 ? String(selectedAmountCandidate) : undefined}
                      onValueChange={(value) => {
                        const candidate = r.amountCandidates[Number(value)];
                        if (candidate) {
                          onEdit(r.key, {
                            amount: candidate.amount,
                            direction: candidate.direction,
                          });
                        }
                      }}
                    >
                      <SelectTrigger className="mt-1 w-full" aria-label="Choose extracted amount">
                        <SelectValue placeholder="Choose amount" />
                      </SelectTrigger>
                      <SelectContent>
                        {r.amountCandidates.map((candidate, index) => (
                          <SelectItem key={`${candidate.amount}-${candidate.direction}-${index}`} value={String(index)}>
                            ${candidate.amount} · {candidate.direction === "DEBIT" ? "Debit" : "Credit"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </TableCell>
                <TableCell>
                  <Select
                    value={r.direction}
                    onValueChange={(v) => onEdit(r.key, { direction: v as ReviewRow["direction"] })}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="DEBIT">Debit</SelectItem>
                      <SelectItem value="CREDIT">Credit</SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <CategorySelect
                    categories={categories}
                    value={r.categoryId || undefined}
                    onChange={(v) => onCategory(r.key, v)}
                    placeholder="Pick a category"
                    className={cn(r.include && !r.categoryId && "border-rose-400")}
                  />
                  {r.suggestion === "csv" ? (
                    <Badge variant="secondary" className="mt-1 gap-1" title={`CSV category: ${r.sourceCategory}`}>
                      <FileSpreadsheetIcon className="size-3" />
                      From CSV
                    </Badge>
                  ) : r.suggestion ? (
                    <Badge variant="secondary" className="mt-1 gap-1">
                      <SparklesIcon className="size-3" />
                      Suggested{r.suggestion === "similar" ? " (similar)" : ""}
                    </Badge>
                  ) : null}
                  {r.sourceCategory && r.suggestion !== "csv" && (
                    <p className="mt-1 truncate text-xs text-muted-foreground" title={r.sourceCategory}>
                      CSV: {r.sourceCategory}
                    </p>
                  )}
                </TableCell>
                <TableCell className="pt-2">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Remove row"
                    onClick={() => onDelete(r.key)}
                  >
                    <Trash2Icon />
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function RowNotes({ row, problems }: { row: ReviewRow; problems: string[] }) {
  if (!row.duplicate && row.warnings.length === 0 && problems.length === 0) return null;
  return (
    <ul className="mt-1 grid gap-0.5 text-xs">
      {row.duplicate && (
        <li className="flex items-center gap-1 text-amber-700 dark:text-amber-400">
          <CopyIcon className="size-3 shrink-0" />
          Possible duplicate of &ldquo;{row.duplicate.description}&rdquo; on{" "}
          {formatDay(inputToDate(row.duplicate.date))}
        </li>
      )}
      {row.warnings.map((w) => (
        <li key={w} className="flex items-center gap-1 text-muted-foreground">
          <AlertTriangleIcon className="size-3 shrink-0" />
          {w}
        </li>
      ))}
      {problems.map((p) => (
        <li key={p} className="text-rose-600 dark:text-rose-400">
          {p}
        </li>
      ))}
    </ul>
  );
}
