"use client";

import { useState } from "react";
import { ChevronDownIcon } from "lucide-react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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

/**
 * Every search word must appear in the category or group name. Categories whose
 * name starts with the first word rank highest, then word starts, then group-only matches.
 */
function matchCategory(value: string, search: string, keywords?: string[]) {
  const terms = search.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return 1;
  const name = value.toLowerCase();
  const haystack = [name, ...(keywords ?? []).map((k) => k.toLowerCase())].join(" ");
  if (!terms.every((t) => haystack.includes(t))) return 0;
  if (name.startsWith(terms[0])) return 1;
  if (name.split(/[^a-z0-9]+/).some((w) => w.startsWith(terms[0]))) return 0.8;
  return name.includes(terms[0]) ? 0.6 : 0.4;
}

/** A category picker with type-to-search over category and group names. */
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
  const [open, setOpen] = useState(false);
  const selected =
    value === "all" && allLabel ? allLabel : categories.find((c) => String(c.id) === value)?.name;

  function pick(next: string) {
    onChange(next);
    setOpen(false);
  }

  return (
    // Modal so the list scrolls and takes focus when used inside a dialog.
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild disabled={disabled}>
        <button
          type="button"
          data-size={size ?? "default"}
          className={cn(
            "flex w-full items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent py-2 pr-2 pl-2.5 text-left text-sm whitespace-nowrap transition-colors outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-[size=default]:h-8 data-[size=sm]:h-7 data-[size=sm]:rounded-[min(var(--radius-md),10px)] dark:bg-input/30 dark:hover:bg-input/50",
            className,
          )}
        >
          <span className={cn("truncate", !selected && "text-muted-foreground")}>
            {selected ?? placeholder}
          </span>
          <ChevronDownIcon className="pointer-events-none size-4 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-(--radix-popover-trigger-width) min-w-56 p-0">
        <Command filter={matchCategory}>
          <CommandInput placeholder="Search categories..." />
          <CommandList className="max-h-80">
            <CommandEmpty>No matching category.</CommandEmpty>
            {allLabel && (
              <CommandGroup>
                <CommandItem value={allLabel} data-checked={value === "all"} onSelect={() => pick("all")}>
                  {allLabel}
                </CommandItem>
              </CommandGroup>
            )}
            {groupOptions(categories).map(([group, options]) => (
              <CommandGroup key={group} heading={group}>
                {options.map((c) => (
                  <CommandItem
                    key={c.id}
                    value={c.name}
                    keywords={[group]}
                    data-checked={String(c.id) === value}
                    onSelect={() => pick(String(c.id))}
                  >
                    {c.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
