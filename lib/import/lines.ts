import type { Line, TextItem, Word } from "./types";

/** Splits a text run into words, estimating each word's horizontal extent from its character offset. */
function splitWords(item: TextItem): Word[] {
  const len = item.str.length;
  if (len === 0) return [];
  const perChar = item.w / len;
  const words: Word[] = [];
  for (const m of item.str.matchAll(/\S+/g)) {
    const start = m.index ?? 0;
    words.push({
      text: m[0],
      x0: item.x + start * perChar,
      x1: item.x + (start + m[0].length) * perChar,
    });
  }
  return words;
}

/** Groups text items into visual lines by their y position, ordered top to bottom per page. */
export function groupLines(items: TextItem[]): Line[] {
  const byPage = new Map<number, TextItem[]>();
  for (const item of items) {
    if (!item.str.trim()) continue;
    const list = byPage.get(item.page) ?? [];
    list.push(item);
    byPage.set(item.page, list);
  }

  const lines: Line[] = [];
  for (const page of [...byPage.keys()].sort((a, b) => a - b)) {
    const pageItems = byPage.get(page)!.sort((a, b) => a.y - b.y || a.x - b.x);
    let current: { y: number; tol: number; items: TextItem[] } | null = null;
    const groups: { y: number; items: TextItem[] }[] = [];
    for (const item of pageItems) {
      const tol = Math.max(2, item.h * 0.45);
      if (current && Math.abs(item.y - current.y) <= Math.max(tol, current.tol)) {
        current.items.push(item);
      } else {
        current = { y: item.y, tol, items: [item] };
        groups.push(current);
      }
    }
    for (const g of groups) {
      const words = g.items.flatMap(splitWords).sort((a, b) => a.x0 - b.x0);
      if (words.length === 0) continue;
      lines.push({
        id: lines.length,
        page,
        y: g.y,
        words,
        text: words.map((w) => w.text).join(" "),
      });
    }
  }
  return lines;
}

/** Joins words whose horizontal gap is small, producing phrase-level labels (used for header detection). */
export function phrases(words: Word[], maxGap = 6): Word[] {
  const out: Word[] = [];
  for (const w of words) {
    const last = out[out.length - 1];
    if (last && w.x0 - last.x1 <= maxGap) {
      last.text = `${last.text} ${w.text}`;
      last.x1 = w.x1;
    } else {
      out.push({ ...w });
    }
  }
  return out;
}
