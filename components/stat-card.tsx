import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCents } from "@/lib/format";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  cents,
  tone,
}: {
  label: string;
  cents: number;
  tone?: "income" | "expense" | "net";
}) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle
          className={cn(
            "text-2xl tabular-nums",
            tone === "income" && "text-emerald-600 dark:text-emerald-400",
            tone === "expense" && "text-rose-600 dark:text-rose-400",
            tone === "net" && cents < 0 && "text-rose-600 dark:text-rose-400",
          )}
        >
          {formatCents(cents)}
        </CardTitle>
      </CardHeader>
    </Card>
  );
}
