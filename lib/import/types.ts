/** A run of text on a page. Coordinates are PDF points with y growing downward. */
export type TextItem = {
  str: string;
  x: number;
  y: number;
  w: number;
  h: number;
  page: number;
};

export type Word = { text: string; x0: number; x1: number };

export type Line = {
  id: number;
  page: number;
  y: number;
  words: Word[];
  text: string;
};

export type ColumnKind = "text" | "money";
export type ColumnRole = "date" | "description" | "debit" | "credit" | "amount" | "balance" | "ignore";

export const TEXT_ROLES = ["date", "description", "ignore"] as const satisfies ColumnRole[];
export const MONEY_ROLES = ["debit", "credit", "amount", "balance", "ignore"] as const satisfies ColumnRole[];

export type Column = {
  label: string;
  kind: ColumnKind;
  role: ColumnRole;
  x0: number;
  x1: number;
};

/** How numeric dates like 03/04 are read. */
export type DateFormat = "auto" | "MDY" | "DMY";

/**
 * How a transaction's direction is decided:
 * - columns: separate debit and credit columns
 * - signed: negative amounts are debits
 * - suffix: amounts marked CR are credits, everything else is a debit
 */
export type SignMode = "auto" | "columns" | "signed" | "suffix";

export type TemplateConfig = {
  /** When set, replaces the auto-detected column layout */
  columns: Column[] | null;
  dateFormat: DateFormat;
  signMode: SignMode;
  flipDirection: boolean;
  /** Case-insensitive substrings; lines containing any of them are skipped */
  skipPatterns: string[];
};

export const DEFAULT_CONFIG: TemplateConfig = {
  columns: null,
  dateFormat: "auto",
  signMode: "auto",
  flipDirection: false,
  skipPatterns: [],
};

export type Direction = "CREDIT" | "DEBIT";

export type LineStatus = "row" | "merged" | "skipped" | "header";

export type DraftRow = {
  /** Stable across re-parses of the same document: based on the first source line */
  key: string;
  /** YYYY-MM-DD, or "" when no date could be read */
  date: string;
  description: string;
  /** Positive decimal string such as "12.34", or "" when no amount could be read */
  amount: string;
  amountCents: number;
  direction: Direction;
  balanceCents: number | null;
  sourceLines: number[];
  warnings: string[];
};

export type StatementBalances = { opening: number | null; closing: number | null };

export type ParseResult = {
  lines: Line[];
  columns: Column[];
  detectedColumns: Column[];
  lineStatus: Map<number, LineStatus>;
  rows: DraftRow[];
  dateFormat: Exclude<DateFormat, "auto">;
  signMode: Exclude<SignMode, "auto">;
  period: { from: string | null; to: string | null };
  balances: StatementBalances;
};
