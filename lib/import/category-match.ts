export type MatchCategory = { id: number; name: string };

export type CategoryMatch = { categoryId: number; confidence: "exact" | "close" };

/**
 * Lowercases, spells out "&", drops punctuation and plural endings, e.g.
 * "Fees & Adjustments" -> "fee and adjustment". Used as the key for saved mappings.
 */
export function normalizeCategoryLabel(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(singular)
    .join(" ");
}

function singular(word: string) {
  if (word.length > 4 && word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

/** Common bank and budgeting-app labels -> default category names. Ignored when the target doesn't exist. */
const SYNONYMS: Record<string, string[]> = {
  "Dining Out": ["food and drink", "food and dining", "restaurants", "dining", "fast food", "takeout"],
  Groceries: ["grocery", "supermarkets", "supermarkets and groceries"],
  Coffee: ["coffee shops", "cafe"],
  Fuel: ["gas", "gasoline", "gas and fuel", "gas stations", "fuel"],
  Salary: ["paycheck", "payroll", "wages", "income", "direct deposit"],
  Interest: ["interest income", "interest earned"],
  Dividends: ["dividend income"],
  "Bank Fees": ["fees", "bank fee", "fees and adjustments", "service fees", "atm fee"],
  "Credit Card Payment": ["payment", "payments", "card payment", "credit card"],
  "Account Transfer": ["transfer", "transfers", "internal transfer"],
  "Car Maintenance": ["automotive", "auto service", "auto repair", "service and parts"],
  "Auto Insurance": ["car insurance"],
  "Doctor & Dental": ["health and wellness", "medical", "doctor", "dentist", "healthcare"],
  Pharmacy: ["drugstore", "drugstores", "pharmacies"],
  Fitness: ["gym", "gyms and fitness centers", "sports"],
  "Parking & Tolls": ["parking", "tolls"],
  "Public Transit": ["public transportation", "transit"],
  Rideshare: ["ride share", "taxi", "taxis and rideshare"],
  "Streaming & Subscriptions": ["streaming", "subscriptions", "subscription"],
  "Movies & Events": ["movies", "movies and dvds", "amusement", "events"],
  Travel: ["airfare", "air travel", "hotel", "lodging", "vacation"],
  Clothing: ["apparel", "clothes"],
  Electronics: ["electronics and software"],
  Gifts: ["gifts and donations", "gift"],
  Charity: ["donations", "charitable giving"],
  "Rent/Mortgage": ["rent", "mortgage", "mortgage and rent"],
  "Mobile Phone": ["phone", "cell phone", "mobile"],
  Internet: ["internet and cable", "cable"],
  Electricity: ["electric"],
  "Water & Sewer": ["water"],
  "Childcare & Education": ["education", "tuition", "childcare"],
  Taxes: ["tax", "federal tax", "state tax"],
  "Maintenance & Repairs": ["home improvement", "home repair"],
  "Personal Care": ["personal"],
};

const SEPARATORS = /\s*[>:|/]\s*/;
const MIN_SCORE = 0.6;

function levenshtein(a: string, b: string) {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = temp;
    }
  }
  return row[b.length];
}

function similarity(a: string, b: string) {
  const longest = Math.max(a.length, b.length);
  return longest === 0 ? 0 : 1 - levenshtein(a, b) / longest;
}

/** Word overlap where words count as shared when nearly identical, blended with whole-string similarity. */
function score(a: string, b: string) {
  const left = a.split(" ");
  const right = b.split(" ");
  let shared = 0;
  for (const word of left) {
    if (right.some((other) => other === word || (word.length >= 4 && similarity(word, other) >= 0.8))) {
      shared++;
    }
  }
  const overlap = shared / (left.length + right.length - shared);
  return Math.max(overlap, similarity(a, b));
}

/** Matches free-text category labels from a bank file to existing categories. */
export function createCategoryMatcher(categories: MatchCategory[]) {
  const byName = new Map<string, number>();
  for (const c of categories) {
    const key = normalizeCategoryLabel(c.name);
    if (key && !byName.has(key)) byName.set(key, c.id);
  }
  const synonyms = new Map<string, number>();
  for (const [target, labels] of Object.entries(SYNONYMS)) {
    const id = byName.get(normalizeCategoryLabel(target));
    if (id === undefined) continue;
    for (const label of labels) {
      const key = normalizeCategoryLabel(label);
      if (!synonyms.has(key)) synonyms.set(key, id);
    }
  }
  const cache = new Map<string, CategoryMatch | null>();

  return function match(value: string): CategoryMatch | null {
    const whole = normalizeCategoryLabel(value);
    if (!whole) return null;
    if (cache.has(whole)) return cache.get(whole)!;

    // "Food & Dining > Restaurants": the last segment is the most specific.
    const segments = value.split(SEPARATORS).map(normalizeCategoryLabel).filter(Boolean);
    const candidates = [...new Set([whole, ...segments.reverse()])];

    let result: CategoryMatch | null = null;
    for (const candidate of candidates) {
      const id = byName.get(candidate);
      if (id !== undefined) {
        result = { categoryId: id, confidence: "exact" };
        break;
      }
    }
    if (!result) {
      for (const candidate of candidates) {
        const id = synonyms.get(candidate);
        if (id !== undefined) {
          result = { categoryId: id, confidence: "close" };
          break;
        }
      }
    }
    if (!result) {
      let best: { id: number; score: number } | null = null;
      for (const candidate of candidates) {
        for (const [name, id] of byName) {
          const s = score(candidate, name);
          if (s >= MIN_SCORE && (!best || s > best.score)) best = { id, score: s };
        }
      }
      if (best) result = { categoryId: best.id, confidence: "close" };
    }

    cache.set(whole, result);
    return result;
  };
}
