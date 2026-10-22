import { isMoney } from "./tokens";
import type { Line } from "./types";

export type TemplateRef = { id: number; name: string; fingerprint: string };

/** Returns the first template whose fingerprint appears in the statement text. */
export function matchTemplate<T extends TemplateRef>(text: string, templates: T[]): T | null {
  const haystack = text.toLowerCase().replace(/\s+/g, " ");
  return (
    templates.find((t) => {
      const needle = t.fingerprint.trim().toLowerCase().replace(/\s+/g, " ");
      return needle.length > 0 && haystack.includes(needle);
    }) ?? null
  );
}

/** Picks a likely identifying line (usually the bank's name) from the top of the first page. */
export function suggestFingerprint(lines: Line[]): string {
  for (const line of lines.slice(0, 15)) {
    if (line.page !== lines[0]?.page) break;
    const words = line.words.map((w) => w.text).filter((t) => !/\d/.test(t) && !isMoney(t));
    const text = words.join(" ");
    if (words.length >= 2 && /[a-z]{3}/i.test(text) && text.length <= 60) return text;
  }
  return "";
}

export function documentText(lines: Line[]) {
  return lines.map((l) => l.text).join("\n");
}
