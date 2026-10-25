import { parseLeadingDate, parseLooseMoney } from "./tokens";
import type { Column, ColumnRole, Line, Word } from "./types";

const COLUMN_STEP = 1000;
const COLUMN_WIDTH = 900;

export class CsvImportError extends Error {}

export type CsvExtraction = {
  lines: Line[];
  columns: Column[];
  headerLineId: number;
  recordCount: number;
};

function quoteEndsField(text: string, index: number, delimiter: string | null) {
  let next = index + 1;
  while (text[next] === " " || text[next] === "\t") next++;
  return (
    next === text.length ||
    (delimiter === null ? ",;\t".includes(text[next]) : text[next] === delimiter) ||
    text[next] === "\n" ||
    text[next] === "\r"
  );
}

function detectDelimiter(input: string) {
  const text = input.replace(/^\uFEFF/, "");
  const counts = new Map([[",", 0], [";", 0], ["\t", 0]]);
  let quoted = false;
  let fieldStart = true;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"' && quoted && text[i + 1] === '"') {
      i++;
    } else if (char === '"' && quoted && quoteEndsField(text, i, null)) {
      quoted = false;
    } else if (char === '"' && !quoted && fieldStart) {
      quoted = !quoted;
    } else if (!quoted && (char === "\n" || char === "\r")) {
      break;
    } else if (!quoted && counts.has(char)) {
      counts.set(char, counts.get(char)! + 1);
      fieldStart = true;
    } else if (!quoted && char !== " " && char !== "\t") {
      fieldStart = false;
    }
  }

  return [...counts].reduce((best, current) => current[1] > best[1] ? current : best)[0];
}

function readRecords(input: string, delimiter: string): string[][] {
  const text = input.replace(/^\uFEFF/, "");
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;
  let fieldStart = true;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === "\\" && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"' && quoteEndsField(text, i, delimiter)) {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"' && fieldStart) {
      field = "";
      quoted = true;
    } else if (char === delimiter) {
      record.push(field);
      field = "";
      fieldStart = true;
    } else if (char === "\n" || char === "\r") {
      record.push(field);
      records.push(record);
      record = [];
      field = "";
      fieldStart = true;
      if (char === "\r" && text[i + 1] === "\n") i++;
    } else {
      field += char;
      if (char !== " " && char !== "\t") fieldStart = false;
    }
  }

  if (quoted) throw new CsvImportError("This CSV has an unclosed quoted field.");
  if (field.length > 0 || record.length > 0) {
    record.push(field);
    records.push(record);
  }
  return records;
}

function clean(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function looksLikeDate(value: string) {
  const normalized = clean(value).replace(/^(\d{4}-\d{1,2}-\d{1,2})[T ].*$/, "$1");
  const date = normalized.split(/\s+/);
  return parseLeadingDate(date, "MDY") !== null || parseLeadingDate(date, "DMY") !== null;
}

function headerRole(label: string): ColumnRole | null {
  if (/\b(date|dated)\b|(?:posting|posted|process|effective|value)\s+date\b/i.test(label)) {
    return "date";
  }
  if (/\b(balance|available balance|running balance)\b/i.test(label)) return "balance";
  if (/\b(credit|credits|deposit|deposits|received|money in|paid in)\b/i.test(label)) return "credit";
  if (/\b(debit|debits|withdrawal|withdrawals|spent|money out|paid out|charge|charges)\b/i.test(label)) return "debit";
  if (/\b(amount|transaction amount|value)\b/i.test(label)) return "amount";
  if (/\b(description|details|memo|payee|merchant|narrative|transaction|name)\b/i.test(label)) {
    return "description";
  }
  return null;
}

function makeWord(text: string, column: number, part = 0): Word {
  const x0 = column * COLUMN_STEP + 10 + part * 20;
  return { text, x0, x1: Math.min(x0 + Math.max(10, text.length * 6), column * COLUMN_STEP + COLUMN_WIDTH) };
}

/** Reads a header-based bank CSV into the line and column model used by statement review. */
export function extractCsv(input: string): CsvExtraction {
  const records = readRecords(input, detectDelimiter(input)).filter((record) =>
    record.some((cell) => clean(cell)),
  );
  const header = records[0]?.map(clean);
  if (!header || header.length < 2 || header.every((cell) => !cell)) {
    throw new CsvImportError("The CSV needs a header row with at least two columns.");
  }

  const data = records.slice(1);
  if (data.length === 0) throw new CsvImportError("No transaction rows were found in this CSV.");

  const normalizedRows = data.map((record, i) => {
    if (record.length > header.length) {
      throw new CsvImportError(`CSV row ${i + 2} has more fields than the header.`);
    }
    return header.map((_, column) => clean(record[column] ?? ""));
  });

  const roles = header.map(headerRole);
  let dateIndex = roles.findIndex((role) => role === "date");
  if (dateIndex === -1) {
    dateIndex = header.findIndex((_, column) =>
      normalizedRows.slice(0, 20).some((row) => row[column] && looksLikeDate(row[column])),
    );
    if (dateIndex !== -1) roles[dateIndex] = "date";
  }

  if (!roles.some((role) => role === "amount" || role === "debit" || role === "credit")) {
    const moneyIndex = header.findIndex((_, column) => {
      const values = normalizedRows.map((row) => row[column]).filter(Boolean);
      return values.length > 0 && values.every((value) => parseLooseMoney(value) !== null);
    });
    if (moneyIndex !== -1 && roles[moneyIndex] !== "date") roles[moneyIndex] = "amount";
  }

  if (dateIndex !== -1) roles[dateIndex] = "date";
  const descriptionIndex = roles.findIndex((role) => role === "description");
  if (descriptionIndex === -1) {
    const firstTextColumn = roles.findIndex((role) => role === null);
    if (firstTextColumn !== -1) roles[firstTextColumn] = "description";
  }

  const order = [
    ...(dateIndex === -1 ? [] : [dateIndex]),
    ...header.map((_, i) => i).filter((i) => i !== dateIndex),
  ];
  const columns: Column[] = order.map((sourceIndex, position) => {
    const role = roles[sourceIndex] ?? "ignore";
    return {
      label: header[sourceIndex] || `Column ${sourceIndex + 1}`,
      kind: role === "debit" || role === "credit" || role === "amount" || role === "balance"
        ? "money"
        : "text",
      role,
      x0: position * COLUMN_STEP + 10,
      x1: position * COLUMN_STEP + COLUMN_WIDTH,
    };
  });

  const lineFor = (values: string[], id: number, headerRow = false): Line => {
    const fields = order.map((sourceIndex, column) => {
      const value = clean(values[sourceIndex] ?? "");
      return !headerRow && columns[column].role === "date"
        ? value.replace(/^(\d{4}-\d{1,2}-\d{1,2})[T ].*$/, "$1")
        : value;
    });
    const words = fields.flatMap((value, column) => {
      if (!value) return [];
      if (!headerRow && columns[column].role === "date") {
        return value.split(/\s+/).map((part, partIndex) => makeWord(part, column, partIndex));
      }
      return [makeWord(value, column)];
    });
    return {
      id,
      page: 1,
      y: id * 15,
      words,
      text: words.map((word) => word.text).join(" "),
    };
  };

  const lines = [
    lineFor(header, 0, true),
    ...normalizedRows.map((record, i) => lineFor(record, i + 1)),
  ];

  return { lines, columns, headerLineId: 0, recordCount: normalizedRows.length };
}
