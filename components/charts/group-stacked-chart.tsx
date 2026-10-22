"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { GroupSeries } from "@/lib/report-math";
import { colorAt, formatAxis, formatDollars } from "./palette";

export function GroupStackedChart({ data, height = 340 }: { data: GroupSeries; height?: number }) {
  const rows = data.rows.map((row) => {
    const out: Record<string, number | string> = { label: row.label };
    for (const g of data.groups) out[g] = Number(row[g] ?? 0) / 100;
    return out;
  });

  if (data.groups.length === 0) {
    return <p className="py-12 text-center text-sm text-muted-foreground">No data in this range.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={rows} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
        <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
        <YAxis tickFormatter={formatAxis} tickLine={false} axisLine={false} fontSize={12} width={64} />
        <Tooltip formatter={(value) => formatDollars(Number(value))} cursor={{ fillOpacity: 0.1 }} />
        <Legend />
        {data.groups.map((g, i) => (
          <Bar key={g} dataKey={g} stackId="groups" fill={colorAt(i)} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
