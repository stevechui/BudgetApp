import { phrases } from "./lines";
import { isMoney } from "./tokens";
import type { Column, ColumnRole, Line, Word } from "./types";

const DATE_RE = /\bdate\b/i;
const CREDIT_RE = /credit|deposit|paid in|money in|receipt/i;
const DEBIT_RE = /debit|withdraw|paid out|money out|charge|payment/i;
const AMOUNT_RE = /amount/i;
const BALANCE_RE = /balance/i;

function moneyRole(label: string): ColumnRole | null {
  if (BALANCE_RE.test(label)) return "balance";
  if (CREDIT_RE.test(label)) return "credit";
  if (DEBIT_RE.test(label)) return "debit";
  if (AMOUNT_RE.test(label)) return "amount";
  return null;
}

function headerColumns(line: Line): Column[] | null {
  if (line.words.some((w) => isMoney(w.text))) return null;
  const labels = phrases(line.words);
  const columns: Column[] = labels.map((p) => {
    const role = DATE_RE.test(p.text) ? "date" : moneyRole(p.text);
    const kind = role && role !== "date" ? "money" : "text";
    return { label: p.text, kind, role: role ?? "description", x0: p.x0, x1: p.x1 };
  });
  const hasDate = columns.some((c) => c.role === "date");
  const hasMoney = columns.some((c) => c.kind === "money");
  return hasDate && hasMoney ? columns : null;
}

/** Finds the first line that looks like a transaction table header. */
export function findHeader(lines: Line[]): { line: Line; columns: Column[] } | null {
  for (const line of lines) {
    if (line.words.length > 12) continue;
    const columns = headerColumns(line);
    if (columns) return { line, columns };
  }
  return null;
}

/**
 * Without a header, locates amount columns by clustering the right edges of
 * money values on lines that look like transactions.
 */
export function clusterColumns(rowLines: { line: Line; skip: number }[]): Column[] {
  const spans: Word[][] = [];
  const perLine: number[][] = [];
  for (const { line, skip } of rowLines) {
    const hits: number[] = [];
    for (const w of line.words.slice(skip)) {
      if (!isMoney(w.text)) continue;
      let idx = spans.findIndex((c) => Math.abs(c[0].x1 - w.x1) <= 15);
      if (idx === -1) {
        idx = spans.length;
        spans.push([]);
      }
      spans[idx].push(w);
      hits.push(idx);
    }
    perLine.push(hits);
  }

  const minCount = Math.max(1, Math.ceil(rowLines.length * 0.1));
  const kept = spans
    .map((words, idx) => ({
      idx,
      count: words.length,
      x0: Math.min(...words.map((w) => w.x0)),
      x1: Math.max(...words.map((w) => w.x1)),
    }))
    .filter((c) => c.count >= minCount)
    .sort((a, b) => a.x1 - b.x1);

  let roles: ColumnRole[];
  if (kept.length === 0) return [];
  if (kept.length === 1) roles = ["amount"];
  else if (kept.length === 2) {
    const [left, right] = kept.map((c) => c.idx);
    const both = perLine.filter((h) => h.includes(left) && h.includes(right)).length;
    roles = both > rowLines.length / 2 ? ["amount", "balance"] : ["debit", "credit"];
  } else {
    roles = [...Array(kept.length - 3).fill("ignore"), "debit", "credit", "balance"];
  }

  return kept.map((c, i) => ({
    label: `Amount column ${i + 1}`,
    kind: "money",
    role: roles[i],
    x0: c.x0,
    x1: c.x1,
  }));
}

export function distance(w: Word, c: Column) {
  return Math.max(0, c.x0 - w.x1, w.x0 - c.x1);
}

/** Picks the closest column of the right kind for a word, or null when there are none. */
export function nearestColumn(w: Word, columns: Column[], kind: Column["kind"]): Column | null {
  let best: Column | null = null;
  let bestScore = Infinity;
  const center = (w.x0 + w.x1) / 2;
  for (const c of columns) {
    if (c.kind !== kind) continue;
    const score = distance(w, c) * 1000 + Math.abs(center - (c.x0 + c.x1) / 2);
    if (score < bestScore) {
      best = c;
      bestScore = score;
    }
  }
  return best;
}
