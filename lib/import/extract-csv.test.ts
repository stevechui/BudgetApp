import { describe, expect, it } from "vitest";
import { extractCsv, CsvImportError } from "./extract-csv";
import { parseStatement } from "./parse";
import { DEFAULT_CONFIG } from "./types";

describe("extractCsv", () => {
  it("reads quoted cells and maps bank columns into review rows", () => {
    const extracted = extractCsv(
      [
        "Transaction Date,Description,Debit,Credit,Running Balance",
        '2026-01-02,"COFFEE, INC.",4.50,,95.50',
        '2026-01-03,"Refund ""market""",,2.00,97.50',
      ].join("\r\n"),
    );

    expect(extracted.columns.map(({ label, role }) => [label, role])).toEqual([
      ["Transaction Date", "date"],
      ["Description", "description"],
      ["Debit", "debit"],
      ["Credit", "credit"],
      ["Running Balance", "balance"],
    ]);
    const parsed = parseStatement(extracted.lines, DEFAULT_CONFIG, {
      detectedColumns: extracted.columns,
      headerLineId: extracted.headerLineId,
      today: new Date("2026-02-10T00:00:00.000Z"),
    });
    expect(parsed.rows.map(({ date, description, amount, direction, balanceCents }) => [
      date,
      description,
      amount,
      direction,
      balanceCents,
    ])).toEqual([
      ["2026-01-02", "COFFEE, INC.", "4.50", "DEBIT", 9550],
      ["2026-01-03", 'Refund "market"', "2.00", "CREDIT", 9750],
    ]);
    expect(parsed.lineStatus.get(extracted.headerLineId)).toBe("header");
  });

  it("preserves embedded line breaks and infers date-first and signed-amount columns", () => {
    const extracted = extractCsv(
      'Details,Posted Date,Amount\n"ONLINE\\nPAYMENT",01/05/2026,-14.99\n'.replaceAll("\\n", "\n"),
    );

    expect(extracted.columns.map(({ label, role }) => [label, role])).toEqual([
      ["Posted Date", "date"],
      ["Details", "description"],
      ["Amount", "amount"],
    ]);
    const parsed = parseStatement(extracted.lines, DEFAULT_CONFIG, {
      detectedColumns: extracted.columns,
      headerLineId: extracted.headerLineId,
      today: new Date("2026-02-10T00:00:00.000Z"),
    });
    expect(parsed.rows.map(({ date, description, amount, direction }) => [
      date,
      description,
      amount,
      direction,
    ])).toEqual([["2026-01-05", "ONLINE PAYMENT", "14.99", "DEBIT"]]);
  });

  it("detects semicolon-delimited bank exports and ignores ISO date timestamps", () => {
    const extracted = extractCsv(
      "Date;Payee;Amount\n2026-01-05T00:00:00.000Z;GROCERY;12.00",
    );
    const parsed = parseStatement(extracted.lines, DEFAULT_CONFIG, {
      detectedColumns: extracted.columns,
      headerLineId: extracted.headerLineId,
      today: new Date("2026-02-10T00:00:00.000Z"),
    });

    expect(parsed.rows.map(({ date, description, amount }) => [date, description, amount])).toEqual([
      ["2026-01-05", "GROCERY", "12.00"],
    ]);
  });

  it.each([
    ["", "header row"],
    ["Date,Description,Amount\n", "No transaction rows"],
    ["Date,Description\n2026-01-01,Shop,5.00", "more fields than the header"],
    ['Date,Description,Amount\n2026-01-01,"Shop,5.00', "unclosed quoted field"],
  ])("rejects invalid CSV input", (input, message) => {
    expect(() => extractCsv(input)).toThrow(new RegExp(message));
  });

  it("rejects quotes that do not begin a field", () => {
    expect(() => extractCsv('Date,Description,Amount\n2026-01-01,Shop "A",5.00')).toThrow(
      CsvImportError,
    );
    expect(() => extractCsv('Date,Description,Amount\n2026-01-01,"Shop"x,5.00')).toThrow(
      CsvImportError,
    );
  });
});
