"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { CategorySeries } from "@/lib/report-math";
import { colorAt, formatAxis, formatDollars } from "./palette";

export function CategoryTrendChart({
  data,
  height = 320,
}: {
  data: CategorySeries;
  height?: number;
}) {
  const rows = data.rows.map((row) => {
    const out: Record<string, number | string> = { label: row.label };
    for (const category of data.categories) out[category] = Number(row[category] ?? 0) / 100;
    return out;
  });

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={rows} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
        <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
        <YAxis tickFormatter={formatAxis} tickLine={false} axisLine={false} fontSize={12} width={64} />
        <Tooltip formatter={(value) => formatDollars(Number(value))} cursor={{ strokeOpacity: 0.1 }} />
        <Legend />
        {data.categories.map((category, index) => (
          <Line
            key={category}
            type="monotone"
            dataKey={category}
            stroke={colorAt(index)}
            strokeWidth={2}
            dot={{ r: 3 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
