import { clusterColumns, distance, findHeader, nearestColumn } from "./columns";
import {
  centsToDecimal,
  findFullDates,
  numericDateParts,
  parseLeadingDate,
  parseLooseMoney,
  parseMoney,
  resolveYear,
  type Money,
  type PartialDate,
} from "./tokens";
import type {
  Column,
  ColumnRole,
  DateFormat,
  Direction,
  DraftRow,
  Line,
  LineStatus,
  ParseResult,
  SignMode,
  StatementBalances,
  TemplateConfig,
  Word,
} from "./types";

const DAY_MS = 86_400_000;
/** Largest vertical gap (in points) between a row and a wrapped description line */
const MAX_WRAP_GAP = 28;

export function detectDateFormat(lines: Line[]): Exclude<DateFormat, "auto"> {
  let dmy = false;
  for (const line of lines) {
    for (const w of line.words.slice(0, 2)) {
      const parts = numericDateParts(w.text);
      if (!parts) continue;
      if (parts.b > 12) return "MDY";
      if (parts.a > 12) dmy = true;
    }
  }
  return dmy ? "DMY" : "MDY";
}

export function matchesSkip(text: string, patterns: string[]) {
  const lower = text.toLowerCase();
  return patterns.some((p) => p.trim() && lower.includes(p.trim().toLowerCase()));
}

/** Builds a skip pattern from a line by dropping dates, amounts and numbers. */
export function suggestSkipPattern(line: Line) {
  return line.words
    .map((w) => w.text)
    .filter((t) => !/\d/.test(t))
    .slice(0, 3)
    .join(" ");
}

/** Merges stand-alone "CR"/"DR" markers and "$" signs into the neighbouring amount. */
function normalizeWords(words: Word[]): Word[] {
  const out: Word[] = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const next = words[i + 1];
    if (w.text === "$" && next && parseMoney(next.text)) continue;
    if (/^(CR|DR)$/i.test(w.text) && out.length && parseMoney(out[out.length - 1].text)) {
      const prev = out[out.length - 1];
      // Keep the amount's own right edge so column clustering still lines up.
      out[out.length - 1] = { ...prev, text: prev.text + w.text.toUpperCase() };
      continue;
    }
    out.push(w);
  }
  return out;
}

type LeadingDate = { date: PartialDate; consumed: number };

function leadingDate(words: Word[], format: Exclude<DateFormat, "auto">): LeadingDate | null {
  const texts = words.map((w) => w.text);
  // "1.05" is an amount, not January 5th.
  const parse = (t: string[]) => (t.length && !parseMoney(t[0]) ? parseLeadingDate(t, format) : null);
  const first = parse(texts);
  if (!first) return null;
  // Many statements list a posting date right after the transaction date.
  const second = parse(texts.slice(first.consumed));
  return { date: first.date, consumed: first.consumed + (second?.consumed ?? 0) };
}

type LineParts = {
  description: Word[];
  category: Word[];
  debit: Money[];
  credit: Money[];
  amount: Money[];
  balance: Money[];
};

function isAmountRole(role: ColumnRole): role is "debit" | "credit" | "amount" | "balance" {
  return role === "debit" || role === "credit" || role === "amount" || role === "balance";
}

function splitLine(words: Word[], columns: Column[]): LineParts {
  const parts: LineParts = { description: [], category: [], debit: [], credit: [], amount: [], balance: [] };
  const hasTextColumns = columns.some((c) => c.kind === "text");
  for (const w of words) {
    const money = parseMoney(w.text);
    if (money) {
      const role = nearestColumn(w, columns, "money")?.role ?? "amount";
      if (isAmountRole(role)) parts[role].push(money);
      continue;
    }
    const col = hasTextColumns ? nearestColumn(w, columns, "text") : null;
    // Numbers without exactly two decimals ("45", "1,234.5") count as amounts only when
    // they sit closer to an amount column than to any text column.
    const moneyCol = nearestColumn(w, columns, "money");
    if (
      moneyCol &&
      isAmountRole(moneyCol.role) &&
      (col ? distance(w, moneyCol) < distance(w, col) : distance(w, moneyCol) === 0)
    ) {
      const loose = parseLooseMoney(w.text);
      if (loose) {
        parts[moneyCol.role].push(loose);
        continue;
      }
    }
    if (!col || col.role === "description") parts.description.push(w);
    else if (col.role === "category") parts.category.push(w);
  }
  return parts;
}

function resolveSignMode(config: TemplateConfig, columns: Column[], lines: Line[]): Exclude<SignMode, "auto"> {
  if (config.signMode !== "auto") return config.signMode;
  if (columns.some((c) => c.role === "debit" || c.role === "credit")) return "columns";
  const hasSuffix = lines.some((l) =>
    normalizeWords(l.words).some((w) => parseMoney(w.text)?.suffix != null),
  );
  return hasSuffix ? "suffix" : "signed";
}

function directionOf(money: Money, role: "debit" | "credit" | "amount", mode: Exclude<SignMode, "auto">): Direction {
  if (money.suffix === "CR") return "CREDIT";
  if (money.suffix === "DR") return "DEBIT";
  if (role === "debit") return money.negative ? "CREDIT" : "DEBIT";
  if (role === "credit") return money.negative ? "DEBIT" : "CREDIT";
  if (mode === "suffix") return "DEBIT";
  return money.negative ? "DEBIT" : "CREDIT";
}

function findPeriod(lines: Line[], format: Exclude<DateFormat, "auto">, today: Date) {
  const limit = today.getTime() + 60 * DAY_MS;
  const dates = lines
    .flatMap((l) => findFullDates(l.text, format))
    .filter((d) => new Date(`${d}T00:00:00.000Z`).getTime() <= limit)
    .sort();
  if (dates.length === 0) return { from: null, to: null };
  const to = dates[dates.length - 1];
  const floor = new Date(`${to}T00:00:00.000Z`).getTime() - 400 * DAY_MS;
  const from = dates.find((d) => new Date(`${d}T00:00:00.000Z`).getTime() >= floor) ?? to;
  return { from, to };
}

const OPENING_RE = /(opening|beginning|starting|previous|prior) balance|balance (brought )?forward/i;
const CLOSING_RE = /(closing|ending|new) balance|balance carried forward/i;

export function findStatementBalances(lines: Line[]): StatementBalances {
  const result: StatementBalances = { opening: null, closing: null };
  for (const line of lines) {
    const amounts = normalizeWords(line.words)
      .map((w) => parseMoney(w.text))
      .filter((m): m is Money => m !== null);
    if (amounts.length === 0) continue;
    const last = amounts[amounts.length - 1];
    const cents = last.negative || last.suffix === "DR" ? -last.cents : last.cents;
    if (result.opening === null && OPENING_RE.test(line.text)) result.opening = cents;
    else if (result.closing === null && CLOSING_RE.test(line.text)) result.closing = cents;
  }
  return result;
}

export function parseStatement(
  lines: Line[],
  config: TemplateConfig,
  options: {
    forcedRows?: ReadonlySet<number>;
    today?: Date;
    detectedColumns?: Column[];
    headerLineId?: number;
  } = {},
): ParseResult {
  const forced = options.forcedRows ?? new Set<number>();
  const today = options.today ?? new Date();
  const dateFormat = config.dateFormat === "auto" ? detectDateFormat(lines) : config.dateFormat;

  const header = findHeader(lines);
  const headerText =
    header?.line.text ?? lines.find((line) => line.id === options.headerLineId)?.text;

  const prepared = lines.map((line) => {
    const words = normalizeWords(line.words);
    return { line, words, lead: leadingDate(words, dateFormat) };
  });

  const detectedColumns =
    options.detectedColumns ??
    header?.columns ??
    clusterColumns(
      prepared
        .filter((p) => p.lead && !matchesSkip(p.line.text, config.skipPatterns))
        .map((p) => ({ line: { ...p.line, words: p.words }, skip: p.lead!.consumed })),
    );
  const columns = config.columns ?? detectedColumns;
  const signMode = resolveSignMode(config, columns, lines);
  const period = findPeriod(lines, dateFormat, today);

  const lineStatus = new Map<number, LineStatus>();
  const rows: DraftRow[] = [];
  const state: {
    /** Most recent row, and the last line that contributed to it */
    last: { row: DraftRow; line: Line; descX0: number } | null;
    /** A dated line without an amount, waiting to see if the amount is on the next line */
    pending: { line: Line; lead: LeadingDate; parts: LineParts } | null;
  } = { last: null, pending: null };

  const pushRow = (line: Line, lead: LeadingDate | null, parts: LineParts, extraLines: Line[] = []) => {
    const warnings: string[] = [];
    let amountCents = 0;
    let direction: Direction = "DEBIT";
    const candidates = [
      ...parts.debit.map((m) => ({ m, role: "debit" as const })),
      ...parts.credit.map((m) => ({ m, role: "credit" as const })),
      ...parts.amount.map((m) => ({ m, role: "amount" as const })),
    ].filter((c) => c.m.cents > 0);
    const amountCandidates = candidates.map(({ m, role }) => {
      let candidateDirection = directionOf(m, role, signMode);
      if (config.flipDirection) candidateDirection = candidateDirection === "DEBIT" ? "CREDIT" : "DEBIT";
      return {
        amount: centsToDecimal(m.cents),
        amountCents: m.cents,
        direction: candidateDirection,
      };
    });
    if (candidates.length > 0) {
      amountCents = candidates[0].m.cents;
      direction = directionOf(candidates[0].m, candidates[0].role, signMode);
      if (candidates.length > 1) warnings.push("Multiple amounts found; choose the correct one below");
    } else {
      warnings.push("No amount found");
    }
    if (config.flipDirection) direction = direction === "DEBIT" ? "CREDIT" : "DEBIT";

    const date = lead ? resolveYear(lead.date, period.to, today) : (state.last?.row.date ?? "");
    if (!lead) warnings.push(date ? "No date on this line; copied from the previous row" : "No date found");

    const bal = parts.balance[0];
    const row: DraftRow = {
      key: `L${line.id}`,
      date,
      description: parts.description.map((w) => w.text).join(" "),
      amount: amountCents ? centsToDecimal(amountCents) : "",
      amountCents,
      amountCandidates,
      direction,
      balanceCents: bal ? (bal.negative || bal.suffix === "DR" ? -bal.cents : bal.cents) : null,
      sourceCategory: parts.category.map((w) => w.text).join(" "),
      sourceLines: [line.id, ...extraLines.map((l) => l.id)],
      warnings,
    };
    rows.push(row);
    lineStatus.set(line.id, "row");
    for (const l of extraLines) lineStatus.set(l.id, "merged");
    state.last = {
      row,
      line: extraLines[extraLines.length - 1] ?? line,
      descX0: parts.description[0]?.x0 ?? line.words[0].x0,
    };
  };

  const hasAmount = (p: LineParts) => p.debit.length + p.credit.length + p.amount.length > 0;

  for (const { line, words, lead } of prepared) {
    const isForced = forced.has(line.id);

    if (state.pending) {
      const parts = splitLine(words, columns);
      const prev = state.pending;
      state.pending = null;
      if (!lead && hasAmount(parts) && !isForced && line.page === prev.line.page) {
        pushRow(prev.line, prev.lead, {
          ...parts,
          description: [...prev.parts.description, ...parts.description],
          category: [...prev.parts.category, ...parts.category],
        }, [line]);
        continue;
      }
      lineStatus.set(prev.line.id, "skipped");
    }

    if (!isForced && headerText && line.text === headerText) {
      lineStatus.set(line.id, "header");
      state.last = null;
      continue;
    }
    if (!isForced && matchesSkip(line.text, config.skipPatterns)) {
      lineStatus.set(line.id, "skipped");
      continue;
    }

    const parts = splitLine(words.slice(lead?.consumed ?? 0), columns);
    const isBalanceLine = OPENING_RE.test(line.text) || CLOSING_RE.test(line.text);

    if (isForced || (lead && hasAmount(parts) && !isBalanceLine)) {
      pushRow(line, lead, parts);
      continue;
    }
    if (lead && parts.description.length > 0 && parts.balance.length === 0 && !isBalanceLine) {
      state.pending = { line, lead, parts };
      continue;
    }

    const prev = state.last;
    if (
      prev &&
      !lead &&
      !hasAmount(parts) &&
      parts.balance.length === 0 &&
      parts.description.length > 0 &&
      line.page === prev.line.page &&
      line.y - prev.line.y <= MAX_WRAP_GAP &&
      parts.description[0].x0 >= prev.descX0 - 5
    ) {
      prev.row.description = `${prev.row.description} ${parts.description.map((w) => w.text).join(" ")}`.trim();
      prev.row.sourceLines.push(line.id);
      lineStatus.set(line.id, "merged");
      prev.line = line;
      continue;
    }
    lineStatus.set(line.id, "skipped");
  }
  if (state.pending) lineStatus.set(state.pending.line.id, "skipped");

  for (let i = 1; i < rows.length; i++) {
    const a = rows[i - 1];
    const b = rows[i];
    if (a.balanceCents === null || b.balanceCents === null || !b.amountCents) continue;
    const delta = Math.abs(b.balanceCents - a.balanceCents);
    if (delta !== b.amountCents) {
      b.warnings.push(
        `Balance changed by ${centsToDecimal(delta)} but the amount is ${b.amount}`,
      );
    }
  }

  return {
    lines,
    columns,
    detectedColumns,
    lineStatus,
    rows,
    dateFormat,
    signMode,
    period,
    balances: findStatementBalances(lines),
  };
}
