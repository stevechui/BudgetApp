import { cn } from "@/lib/utils";
import { formatCents } from "@/lib/format";

export function Money({
  cents,
  direction,
  className,
}: {
  cents: number;
  direction?: "CREDIT" | "DEBIT";
  className?: string;
}) {
  const signed = direction === "DEBIT" ? -cents : cents;
  return (
    <span
      className={cn(
        "tabular-nums",
        direction === "CREDIT" && "text-emerald-600 dark:text-emerald-400",
        className,
      )}
    >
      {direction === "CREDIT" && "+"}
      {formatCents(signed)}
    </span>
  );
}
