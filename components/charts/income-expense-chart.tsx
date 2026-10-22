"use client";

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { SeriesPoint } from "@/lib/report-math";
import { EXPENSE_COLOR, INCOME_COLOR, NET_COLOR, formatAxis, formatDollars } from "./palette";

export type Show = "both" | "income" | "expense";

export function IncomeExpenseChart({
  data,
  show = "both",
  height = 320,
}: {
  data: SeriesPoint[];
  show?: Show;
  height?: number;
}) {
  const rows = data.map((p) => ({
    label: p.label,
    income: p.income / 100,
    expense: p.expense / 100,
    net: p.net / 100,
  }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={rows} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
        <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
        <YAxis tickFormatter={formatAxis} tickLine={false} axisLine={false} fontSize={12} width={64} />
        <Tooltip
          formatter={(value) => formatDollars(Number(value))}
          cursor={{ fillOpacity: 0.1 }}
        />
        <Legend />
        {show !== "expense" && (
          <Bar dataKey="income" name="Income" fill={INCOME_COLOR} radius={[4, 4, 0, 0]} />
        )}
        {show !== "income" && (
          <Bar dataKey="expense" name="Expense" fill={EXPENSE_COLOR} radius={[4, 4, 0, 0]} />
        )}
        {show === "both" && (
          <Line
            dataKey="net"
            name="Net"
            type="monotone"
            stroke={NET_COLOR}
            strokeWidth={2}
            dot={{ r: 3 }}
          />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
}
