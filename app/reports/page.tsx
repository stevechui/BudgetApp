import { Suspense } from "react";
import { format } from "date-fns";
import { connection } from "next/server";
import { BreakdownPie } from "@/components/charts/breakdown-pie";
import { GroupStackedChart } from "@/components/charts/group-stacked-chart";
import { IncomeExpenseChart, type Show } from "@/components/charts/income-expense-chart";
import { LoadingBlock, PageHeader } from "@/components/page-header";
import { ReportControls } from "@/components/report-controls";
import { StatCard } from "@/components/stat-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { defaultRange, parseDay, PERIODS, type Period } from "@/lib/report-math";
import { getSeries } from "@/lib/reports";

const PERIOD_LABEL: Record<Period, string> = {
  week: "Weekly",
  month: "Monthly",
  quarter: "Quarterly",
};

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export default function ReportsPage(props: PageProps<"/reports">) {
  return (
    <>
      <PageHeader
        title="Reports"
        description="Income and expenses over time. Transfers are excluded."
      />
      <Suspense fallback={<LoadingBlock label="Crunching numbers..." />}>
        <ReportsContent searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}

async function ReportsContent({ searchParams }: Pick<PageProps<"/reports">, "searchParams">) {
  const sp = await searchParams;
  await connection();
  const period = PERIODS.includes(sp.period as Period) ? (sp.period as Period) : "month";
  const show: Show = sp.show === "income" || sp.show === "expense" ? sp.show : "both";
  const fromParam = typeof sp.from === "string" && DAY.test(sp.from) ? sp.from : undefined;
  const toParam = typeof sp.to === "string" && DAY.test(sp.to) ? sp.to : undefined;

  const defaults = defaultRange(period, toParam ? parseDay(toParam) : new Date());
  const from = fromParam ? parseDay(fromParam) : defaults.from;
  const to = toParam ? parseDay(toParam) : defaults.to;

  const breakdownKind = show === "income" ? "income" : "expense";
  const data = await getSeries({ period, from, to, groupBy: "group", groupKind: breakdownKind });
  const rangeLabel = `${format(from, "MMM d, yyyy")} – ${format(to, "MMM d, yyyy")}`;

  return (
    <div className="grid gap-6">
      <ReportControls
        key={`${period}-${show}-${fromParam}-${toParam}`}
        initial={{
          period,
          show,
          from: format(from, "yyyy-MM-dd"),
          to: format(to, "yyyy-MM-dd"),
          custom: Boolean(fromParam || toParam),
        }}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Income" cents={data.totals.income} tone="income" />
        <StatCard label="Expense" cents={data.totals.expense} tone="expense" />
        <StatCard label="Net" cents={data.totals.net} tone="net" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{PERIOD_LABEL[period]} income vs. expense</CardTitle>
          <CardDescription>{rangeLabel}</CardDescription>
        </CardHeader>
        <CardContent>
          <IncomeExpenseChart data={data.series} show={show} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            {PERIOD_LABEL[period]} {breakdownKind} by category group
          </CardTitle>
          <CardDescription>{rangeLabel}</CardDescription>
        </CardHeader>
        <CardContent>
          {data.groupSeries && <GroupStackedChart data={data.groupSeries} />}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{breakdownKind === "income" ? "Income" : "Expense"} breakdown</CardTitle>
          <CardDescription>{rangeLabel}</CardDescription>
        </CardHeader>
        <CardContent>
          <BreakdownPie
            key={breakdownKind}
            items={breakdownKind === "income" ? data.incomeBreakdown : data.expenseBreakdown}
          />
        </CardContent>
      </Card>
    </div>
  );
}
