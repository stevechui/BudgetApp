import { Badge } from "@/components/ui/badge";
import type { CategoryType } from "@/lib/generated/prisma/enums";

const STYLES: Record<CategoryType, string> = {
  CREDIT: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  DEBIT: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300",
  TRANSFER: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
};

const LABELS: Record<CategoryType, string> = {
  CREDIT: "Credit",
  DEBIT: "Debit",
  TRANSFER: "Transfer",
};

export function CategoryTypeBadge({ type }: { type: CategoryType }) {
  return (
    <Badge variant="secondary" className={STYLES[type]}>
      {LABELS[type]}
    </Badge>
  );
}
