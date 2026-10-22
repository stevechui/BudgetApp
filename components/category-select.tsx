"use client";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CategoryType } from "@/lib/generated/prisma/enums";
import { cn } from "@/lib/utils";

export type CategoryOption = {
  id: number;
  name: string;
  type: CategoryType;
  groupName: string;
};

export function groupOptions(categories: CategoryOption[]) {
  const map = new Map<string, CategoryOption[]>();
  for (const c of categories) {
    const list = map.get(c.groupName) ?? [];
    list.push(c);
    map.set(c.groupName, list);
  }
  return [...map.entries()];
}

export function CategorySelect({
  categories,
  value,
  onChange,
  placeholder = "Select a category",
  className,
  size,
  disabled,
  allLabel,
}: {
  categories: CategoryOption[];
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  size?: "sm" | "default";
  disabled?: boolean;
  /** When set, adds an "all" option with value "all" */
  allLabel?: string;
}) {
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger className={cn("w-full", className)} size={size}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent position="popper" className="max-h-80">
        {allLabel && <SelectItem value="all">{allLabel}</SelectItem>}
        {groupOptions(categories).map(([group, options]) => (
          <SelectGroup key={group}>
            <SelectLabel>{group}</SelectLabel>
            {options.map((c) => (
              <SelectItem key={c.id} value={String(c.id)}>
                {c.name}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}
