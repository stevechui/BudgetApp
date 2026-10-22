import type { Direction } from "./types";

type CategoryType = "CREDIT" | "DEBIT" | "TRANSFER";

const NOISE = new Set([
  "pos", "purchase", "debit", "credit", "card", "visa", "mastercard", "ach", "recurring",
  "pmt", "online", "web", "id", "ref", "the", "and", "of", "inc", "llc", "co", "www", "com",
]);

/** Reduces a bank description to its stable merchant words, e.g. "POS STARBUCKS #1234 SEATTLE" -> "starbucks seattle". */
export function normalizeDescription(description: string) {
  return description
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !/\d/.test(w) && !NOISE.has(w))
    .join(" ");
}

/** Normalized description -> category id of the most recent transaction with that description. */
export type CategoryHistory = [key: string, categoryId: number][];

export type SuggestCategory = { id: number; type: CategoryType };

export type Suggestion = { categoryId: number; match: "exact" | "similar" };

function fits(type: CategoryType, direction: Direction) {
  return type === "TRANSFER" || type === direction;
}

export function createSuggester(history: CategoryHistory, categories: SuggestCategory[]) {
  const types = new Map(categories.map((c) => [c.id, c.type]));
  const exact = new Map(history);
  const entries = history.map(([key, categoryId]) => ({ tokens: new Set(key.split(" ")), categoryId }));

  return function suggest(description: string, direction: Direction): Suggestion | null {
    const key = normalizeDescription(description);
    if (!key) return null;
    const hit = exact.get(key);
    const hitType = hit !== undefined ? types.get(hit) : undefined;
    if (hit !== undefined && hitType && fits(hitType, direction)) return { categoryId: hit, match: "exact" };

    const tokens = key.split(" ");
    let best: { categoryId: number; score: number } | null = null;
    for (const entry of entries) {
      const type = types.get(entry.categoryId);
      if (!type || !fits(type, direction)) continue;
      let shared = 0;
      for (const t of tokens) if (entry.tokens.has(t)) shared++;
      if (shared === 0) continue;
      const score = shared / (tokens.length + entry.tokens.size - shared);
      // The first word is usually the merchant, so matching it counts on its own.
      const merchant = entry.tokens.has(tokens[0]) && tokens[0].length >= 4 ? 0.5 : 0;
      const total = Math.max(score, merchant);
      if (total >= 0.5 && (!best || total > best.score)) best = { categoryId: entry.categoryId, score: total };
    }
    return best ? { categoryId: best.categoryId, match: "similar" } : null;
  };
}
