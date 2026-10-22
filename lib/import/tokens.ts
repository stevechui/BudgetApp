import type { DateFormat } from "./types";

const MONEY_RE = /^(\()?([-+])?\$?(\d{1,3}(?:,\d{3})+|\d+)\.(\d{2})(\))?(-)?(CR|DR)?$/i;

export type Money = { cents: number; negative: boolean; suffix: "CR" | "DR" | null };

/** Parses amounts like 1,234.56, $12.00, (12.00), -12.00, 12.00-, 12.00CR. */
export function parseMoney(token: string): Money | null {
  const m = MONEY_RE.exec(token.trim());
  if (!m) return null;
  const [, open, sign, whole, frac, close, trailingMinus, suffix] = m;
  if (Boolean(open) !== Boolean(close)) return null;
  const cents = Number(whole.replace(/,/g, "")) * 100 + Number(frac);
  return {
    cents,
    negative: Boolean(open) || sign === "-" || Boolean(trailingMinus),
    suffix: suffix ? (suffix.toUpperCase() as "CR" | "DR") : null,
  };
}

const LOOSE_MONEY_RE = /^(\()?([-+])?\$?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?(\))?(-)?(CR|DR)?$/i;

/**
 * Like parseMoney but also accepts whole numbers and one decimal place ("45", "1,234.5").
 * Only safe for tokens already known to sit in an amount column.
 */
export function parseLooseMoney(token: string): Money | null {
  const strict = parseMoney(token);
  if (strict) return strict;
  const m = LOOSE_MONEY_RE.exec(token.trim());
  if (!m) return null;
  const [, open, sign, whole, frac = "", close, trailingMinus, suffix] = m;
  if (Boolean(open) !== Boolean(close)) return null;
  return {
    cents: Number(whole.replace(/,/g, "")) * 100 + Number(frac.padEnd(2, "0")),
    negative: Boolean(open) || sign === "-" || Boolean(trailingMinus),
    suffix: suffix ? (suffix.toUpperCase() as "CR" | "DR") : null,
  };
}

export function isMoney(token: string) {
  return parseMoney(token) !== null;
}

export function centsToDecimal(cents: number) {
  return (Math.abs(cents) / 100).toFixed(2);
}

const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

/** Matches full month names and abbreviations of at least three letters ("Jan", "Sept", "Sep."). */
function monthFromName(word: string): number | null {
  const key = word.toLowerCase().replace(/[.,]/g, "");
  if (key.length < 3) return null;
  const index = MONTHS.findIndex((m) => m.startsWith(key));
  return index === -1 ? null : index + 1;
}

export type PartialDate = { y: number | null; m: number; d: number };

export type NumericDateParts = { a: number; b: number };

const NUMERIC_RE = /^(\d{1,2})[/\-.](\d{1,2})(?:[/\-.](\d{2}|\d{4}))?$/;
const ISO_RE = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;
const COMPACT_RE = /^(\d{1,2})-?([A-Za-z]{3,9})\.?(?:-(\d{2}|\d{4}))?$/;
const COMPACT_MD_RE = /^([A-Za-z]{3,9})-(\d{1,2})(?:-(\d{2}|\d{4}))?$/;

function fullYear(y: string | undefined): number | null {
  if (!y) return null;
  const n = Number(y);
  return y.length === 2 ? 2000 + n : n;
}

function valid(p: PartialDate): PartialDate | null {
  if (p.m < 1 || p.m > 12 || p.d < 1 || p.d > 31) return null;
  if (p.y !== null) {
    const dt = new Date(Date.UTC(p.y, p.m - 1, p.d));
    if (dt.getUTCMonth() !== p.m - 1) return null;
  }
  return p;
}

/** Returns the two leading numbers of a numeric date (e.g. "03/04"), used to guess MDY vs DMY. */
export function numericDateParts(word: string): NumericDateParts | null {
  const m = NUMERIC_RE.exec(word);
  return m ? { a: Number(m[1]), b: Number(m[2]) } : null;
}

/**
 * Reads a date from the start of a word list.
 * Supports 01/05, 1/5/26, 2026-01-05, 05-Jan-2026, 05Jan, "05 Jan 2026", "Jan 5, 2026".
 */
export function parseLeadingDate(
  words: string[],
  format: Exclude<DateFormat, "auto">,
): { date: PartialDate; consumed: number } | null {
  const [w0 = "", w1 = "", w2 = ""] = words;

  let m = ISO_RE.exec(w0);
  if (m) {
    const date = valid({ y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) });
    return date ? { date, consumed: 1 } : null;
  }

  m = NUMERIC_RE.exec(w0);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    const [mm, dd] = format === "DMY" ? [b, a] : [a, b];
    const date = valid({ y: fullYear(m[3]), m: mm, d: dd });
    return date ? { date, consumed: 1 } : null;
  }

  m = COMPACT_RE.exec(w0);
  if (m) {
    const month = monthFromName(m[2]);
    if (month) {
      const date = valid({ y: fullYear(m[3]), m: month, d: Number(m[1]) });
      if (date) return { date, consumed: 1 };
    }
  }

  m = COMPACT_MD_RE.exec(w0);
  if (m) {
    const month = monthFromName(m[1]);
    if (month) {
      const date = valid({ y: fullYear(m[3]), m: month, d: Number(m[2]) });
      if (date) return { date, consumed: 1 };
    }
  }

  // "05 Jan [2026]"
  if (/^\d{1,2}$/.test(w0)) {
    const month = monthFromName(w1);
    if (month) {
      const hasYear = /^(19|20)\d{2}$/.test(w2);
      const date = valid({ y: hasYear ? Number(w2) : null, m: month, d: Number(w0) });
      if (date) return { date, consumed: hasYear ? 3 : 2 };
    }
  }

  // "Jan 5[,] [2026]"
  const month = monthFromName(w0);
  if (month && /^\d{1,2},?$/.test(w1)) {
    const hasYear = /^(19|20)\d{2}$/.test(w2);
    const date = valid({ y: hasYear ? Number(w2) : null, m: month, d: Number(w1.replace(",", "")) });
    if (date) return { date, consumed: hasYear ? 3 : 2 };
  }

  return null;
}

export function toIsoDate(y: number, m: number, d: number) {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

const DAY_MS = 86_400_000;

/**
 * Fills in a missing year using the statement's end date: the date is placed in the
 * end date's year, or the year before if that would put it well after the statement ends.
 */
export function resolveYear(date: PartialDate, periodEnd: string | null, today = new Date()): string {
  if (date.y !== null) return toIsoDate(date.y, date.m, date.d);
  const end = periodEnd ? new Date(`${periodEnd}T00:00:00.000Z`) : today;
  const year = end.getUTCFullYear();
  const candidate = Date.UTC(year, date.m - 1, date.d);
  const y = candidate > end.getTime() + 31 * DAY_MS ? year - 1 : year;
  return toIsoDate(y, date.m, date.d);
}

/** Finds every full date (with a year) anywhere in a line of text. */
export function findFullDates(text: string, format: Exclude<DateFormat, "auto">): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const found: string[] = [];
  for (let i = 0; i < words.length; i++) {
    const res = parseLeadingDate(words.slice(i, i + 3), format);
    if (res && res.date.y !== null) {
      found.push(toIsoDate(res.date.y, res.date.m, res.date.d));
      i += res.consumed - 1;
    }
  }
  return found;
}
