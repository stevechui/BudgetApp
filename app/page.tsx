import { Suspense } from "react";
import Link from "next/link";
import { addMonths, format, startOfMonth } from "date-fns";
import { connection } from "next/server";
import { IncomeExpenseChart } from "@/components/charts/income-expense-chart";
import { Money } from "@/components/money";
import { LoadingBlock, PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatDay } from "@/lib/format";
import { getRecentTransactions } from "@/lib/queries";
import { getReportTransactions } from "@/lib/reports";
import { buildSeries, toLocalDay, totals } from "@/lib/report-math";

export default function DashboardPage() {
  return (
    <>
      <PageHeader title="Dashboard" description="Where your money went this month." />
      <div className="grid gap-6">
        <Suspense fallback={<LoadingBlock />}>
          <Summary />
        </Suspense>
        <Suspense fallback={<LoadingBlock />}>
          <RecentTransactions />
        </Suspense>
      </div>
    </>
  );
}

async function Summary() {
  await connection();
  const today = new Date();
  const monthStart = startOfMonth(today);
  const transactions = await getReportTransactions(addMonths(monthStart, -5), today);
  const thisMonth = totals(transactions.filter((t) => toLocalDay(t.date) >= monthStart));
  const series = buildSeries(transactions, {
    period: "month",
    from: addMonths(monthStart, -5),
    to: today,
  });

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label={`Income · ${format(today, "MMMM")}`} cents={thisMonth.income} tone="income" />
        <StatCard label={`Expense · ${format(today, "MMMM")}`} cents={thisMonth.expense} tone="expense" />
        <StatCard label={`Net · ${format(today, "MMMM")}`} cents={thisMonth.net} tone="net" />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Last 6 months</CardTitle>
          <CardDescription>Monthly income, expense and net</CardDescription>
          <CardAction>
            <Button variant="outline" size="sm" asChild>
              <Link href="/reports">Open reports</Link>
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          <IncomeExpenseChart data={series} height={260} />
        </CardContent>
      </Card>
    </>
  );
}

async function RecentTransactions() {
  const recent = await getRecentTransactions(10);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent transactions</CardTitle>
        <CardAction>
          <Button variant="outline" size="sm" asChild>
            <Link href="/transactions">View all</Link>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {recent.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No transactions yet.{" "}
            <Link href="/transactions" className="underline">
              Add your first one
            </Link>
            .
          </p>
        ) : (
          <ul className="divide-y">
            {recent.map((t) => (
              <li key={t.id} className="flex items-center gap-4 py-2.5 text-sm">
                <span className="w-28 shrink-0 text-muted-foreground">{formatDay(t.date)}</span>
                <span className="flex-1 truncate font-medium">{t.description}</span>
                <span className="hidden w-48 truncate text-muted-foreground sm:block">
                  {t.category.name}
                </span>
                <Money
                  cents={t.amountCents}
                  direction={t.direction}
                  className="w-28 text-right"
                />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
