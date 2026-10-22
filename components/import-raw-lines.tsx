"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Line, LineStatus, ParseResult } from "@/lib/import/types";

const STATUS_VARIANT: Record<LineStatus, "default" | "secondary" | "outline"> = {
  row: "default",
  merged: "secondary",
  header: "outline",
  skipped: "outline",
};

const FILTERS = ["all", "row", "skipped"] as const;

export function ImportRawLines({
  result,
  forced,
  onForce,
  onSkipSimilar,
}: {
  result: ParseResult;
  forced: ReadonlySet<number>;
  onForce: (lineId: number, force: boolean) => void;
  onSkipSimilar: (line: Line) => void;
}) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");
  const lines = result.lines.filter((l) => {
    const status = result.lineStatus.get(l.id) ?? "skipped";
    if (filter === "row") return status === "row" || status === "merged";
    if (filter === "skipped") return status === "skipped" || status === "header";
    return true;
  });

  return (
    <div className="grid gap-2">
      <div className="flex items-center gap-1 text-sm">
        {FILTERS.map((f) => (
          <Button
            key={f}
            size="sm"
            variant={filter === f ? "secondary" : "ghost"}
            onClick={() => setFilter(f)}
          >
            {f === "all" ? "All lines" : f === "row" ? "Used in rows" : "Skipped"}
          </Button>
        ))}
      </div>
      <div className="max-h-[28rem] overflow-auto rounded-xl border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-14">Page</TableHead>
              <TableHead className="w-24">Status</TableHead>
              <TableHead>Text</TableHead>
              <TableHead className="w-56" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((line) => {
              const status = result.lineStatus.get(line.id) ?? "skipped";
              const isForced = forced.has(line.id);
              return (
                <TableRow key={line.id}>
                  <TableCell className="text-muted-foreground">{line.page}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[status]}>{isForced ? "forced row" : status}</Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs whitespace-pre-wrap">{line.text}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      {isForced ? (
                        <Button size="xs" variant="outline" onClick={() => onForce(line.id, false)}>
                          Undo forced row
                        </Button>
                      ) : (
                        status !== "row" && (
                          <Button size="xs" variant="outline" onClick={() => onForce(line.id, true)}>
                            Make row
                          </Button>
                        )
                      )}
                      {status !== "header" && (
                        <Button size="xs" variant="ghost" onClick={() => onSkipSimilar(line)}>
                          Skip similar
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
