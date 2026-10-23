"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AccountType } from "@/lib/generated/prisma/enums";

export type AccountOption = { id: number; name: string; type: AccountType };

/** An account picker. The list is short, so a plain select is enough. */
export function AccountSelect({
  accounts,
  value,
  onChange,
  placeholder = "Select an account",
  className = "w-full",
  size,
  disabled,
  allLabel,
  id,
}: {
  accounts: AccountOption[];
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  size?: "sm" | "default";
  disabled?: boolean;
  /** When set, adds an "all" option with value "all" */
  allLabel?: string;
  id?: string;
}) {
  return (
    <Select value={value || undefined} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger id={id} className={className} size={size} aria-label="Account">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {allLabel && <SelectItem value="all">{allLabel}</SelectItem>}
        {accounts.map((a) => (
          <SelectItem key={a.id} value={String(a.id)}>
            {a.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
