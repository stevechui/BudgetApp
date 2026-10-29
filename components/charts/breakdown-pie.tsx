"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Button } from "@/components/ui/button";
import type { BreakdownItem } from "@/lib/report-math";
import { colorAt, formatDollars } from "./palette";

/** Pie of totals by category group; click a slice to see the categories inside it. */
export function BreakdownPie({
  items,
  from,
  to,
  height = 300,
}: {
  items: BreakdownItem[];
  from: string;
  to: string;
  height?: number;
}) {
  const router = useRouter();
  const [group, setGroup] = useState<string | null>(null);

  const slices = useMemo(() => {
    if (group) {
      return items
        .filter((i) => i.group === group)
        .map((i) => ({ name: i.category, value: i.value / 100, id: i.id }));
    }
    const totals = new Map<string, number>();
    for (const i of items) totals.set(i.group, (totals.get(i.group) ?? 0) + i.value);
    return [...totals.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name, value]) => ({ name, value: value / 100, id: undefined }));
  }, [items, group]);

  const total = slices.reduce((sum, s) => sum + s.value, 0);

  if (items.length === 0) {
    return <p className="py-12 text-center text-sm text-muted-foreground">No data in this range.</p>;
  }

  return (
    <div className="grid gap-4 md:grid-cols-[1fr_1fr]">
      <div>
        <div className="mb-2 flex h-7 items-center gap-2 text-sm">
          {group ? (
            <>
              <Button variant="ghost" size="sm" onClick={() => setGroup(null)}>
                <ArrowLeftIcon /> All groups
              </Button>
              <span className="font-medium">{group}</span>
            </>
          ) : (
            <span className="text-muted-foreground">Click a slice to see its categories</span>
          )}
        </div>
        <ResponsiveContainer width="100%" height={height}>
          <PieChart>
            <Pie
              data={slices}
              dataKey="value"
              nameKey="name"
              innerRadius="50%"
              outerRadius="85%"
              paddingAngle={1}
              onClick={(_, index) => {
                const slice = slices[index];
                if (!slice) return;
                if (!group) setGroup(slice.name);
                else if (slice.id) router.push(`/transactions?category=${slice.id}&from=${from}&to=${to}`);
              }}
              className={group ? undefined : "cursor-pointer"}
            >
              {slices.map((s, i) => (
                <Cell key={s.name} fill={colorAt(i)} />
              ))}
            </Pie>
            <Tooltip formatter={(value) => formatDollars(Number(value))} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="grid content-start gap-1.5 text-sm">
        {slices.map((s, i) => (
          <li key={s.name}>
            <button
              type="button"
              onClick={() => {
                const slice = slices.find((item) => item.name === s.name);
                if (!group) setGroup(s.name);
                else if (slice?.id) router.push(`/transactions?category=${slice.id}&from=${from}&to=${to}`);
              }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left enabled:hover:bg-muted"
            >
              <span className="size-3 shrink-0 rounded-sm" style={{ background: colorAt(i) }} />
              <span className="flex-1 truncate">{s.name}</span>
              <span className="tabular-nums text-muted-foreground">
                {total ? Math.round((s.value / total) * 100) : 0}%
              </span>
              <span className="w-24 text-right tabular-nums">{formatDollars(s.value)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
