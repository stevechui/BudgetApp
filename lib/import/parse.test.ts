import { describe, expect, it } from "vitest";
import { groupLines } from "./lines";
import { detectDateFormat, parseStatement, suggestSkipPattern } from "./parse";
import { reconcile } from "./reconcile";
import { matchTemplate, suggestFingerprint } from "./template";
import { DEFAULT_CONFIG, type TemplateConfig, type TextItem } from "./types";

const today = new Date("2026-02-10T00:00:00.000Z");

/** Builds a line of text items; each cell is [x, text]. Width is 5pt per character. */
function row(y: number, cells: [number, string][], page = 1): TextItem[] {
  return cells.map(([x, str]) => ({ str, x, y, w: str.length * 5, h: 10, page }));
}

function parse(items: TextItem[], config: Partial<TemplateConfig> = {}, forced?: Set<number>) {
  return parseStatement(groupLines(items), { ...DEFAULT_CONFIG, ...config }, { today, forcedRows: forced });
}

const checking = [
  ...row(20, [[50, "FIRST NATIONAL BANK"]]),
  ...row(40, [[50, "Statement Period: 12/01/2025 - 01/31/2026"]]),
  ...row(80, [[50, "Date"], [110, "Description"], [330, "Withdrawals"], [420, "Deposits"], [500, "Balance"]]),
  ...row(95, [[110, "Beginning Balance"], [500, "1,000.00"]]),
  ...row(110, [[50, "12/28"], [110, "STARBUCKS #123"], [340, "5.25"], [500, "994.75"]]),
  ...row(122, [[110, "SEATTLE WA"]]),
  ...row(137, [[50, "01/02"], [110, "PAYROLL ACME"], [425, "2,000.00"], [500, "2,994.75"]]),
  ...row(152, [[50, "01/05"], [78, "01/06"], [110, "RENT"], [340, "1,500.00"], [500, "1,494.75"]]),
  ...row(167, [[110, "Ending Balance"], [500, "1,494.75"]]),
  ...row(200, [[250, "Page 1 of 1"]]),
];

describe("parseStatement with a header and debit/credit columns", () => {
  const result = parse(checking);

  it("detects the column layout from the header", () => {
    expect(result.detectedColumns.map((c) => [c.label, c.role])).toEqual([
      ["Date", "date"],
      ["Description", "description"],
      ["Withdrawals", "debit"],
      ["Deposits", "credit"],
      ["Balance", "balance"],
    ]);
    expect(result.signMode).toBe("columns");
  });

  it("extracts rows, merging wrapped descriptions and skipping posting dates", () => {
    expect(
      result.rows.map((r) => [r.date, r.description, r.amount, r.direction, r.balanceCents]),
    ).toEqual([
      ["2025-12-28", "STARBUCKS #123 SEATTLE WA", "5.25", "DEBIT", 99475],
      ["2026-01-02", "PAYROLL ACME", "2000.00", "CREDIT", 299475],
      ["2026-01-05", "RENT", "1500.00", "DEBIT", 149475],
    ]);
    expect(result.rows.every((r) => r.warnings.length === 0)).toBe(true);
  });

  it("labels every line", () => {
    const statuses = result.lines.map((l) => result.lineStatus.get(l.id));
    expect(statuses).toEqual([
      "skipped", "skipped", "header", "skipped", "row", "merged", "row", "row", "skipped", "skipped",
    ]);
  });

  it("finds the period and the stated balances, and reconciles", () => {
    expect(result.period.to).toBe("2026-01-31");
    expect(result.balances).toEqual({ opening: 100000, closing: 149475 });
    expect(reconcile(result.rows, result.balances)).toMatchObject({
      status: "ok",
      convention: "asset",
      diff: 0,
    });
  });

  it("flags a misread amount through the running balance", () => {
    const broken = checking.map((i) => (i.str === "2,000.00" ? { ...i, str: "2,000.80" } : i));
    const rows = parse(broken).rows;
    expect(rows[1].warnings[0]).toMatch(/Balance changed by 2000.00/);
    expect(reconcile(rows, parse(broken).balances)).toMatchObject({ status: "mismatch", diff: -80 });
  });

  it("applies column role overrides and flip direction", () => {
    const columns = result.detectedColumns.map((c) =>
      c.role === "balance" ? { ...c, role: "ignore" as const } : c,
    );
    const rows = parse(checking, { columns, flipDirection: true }).rows;
    expect(rows.map((r) => [r.direction, r.balanceCents])).toEqual([
      ["CREDIT", null],
      ["DEBIT", null],
      ["CREDIT", null],
    ]);
  });

  it("honours skip patterns and forced rows", () => {
    const skipped = parse(checking, { skipPatterns: ["payroll"] });
    expect(skipped.rows.map((r) => r.description)).toEqual(["STARBUCKS #123 SEATTLE WA", "RENT"]);

    const pageLine = result.lines.find((l) => l.text === "Page 1 of 1")!;
    const forced = parse(checking, {}, new Set([pageLine.id]));
    const last = forced.rows[forced.rows.length - 1];
    expect(last.date).toBe("2026-01-05");
    expect(last.warnings).toContain("No date on this line; copied from the previous row");
  });
});

describe("column type overrides", () => {
  const items = [
    ...row(80, [[50, "Date"], [110, "Details"], [330, "Spent"], [420, "Received"], [500, "Balance"]]),
    ...row(110, [[50, "01/03"], [110, "GROCERY 0456"], [345, "45"], [500, "955.00"]]),
    ...row(125, [[50, "01/04"], [110, "PAYROLL"], [420, "1,200"], [500, "2,155.00"]]),
  ];

  it("treats unrecognized headers as text, so their whole-number amounts are missed", () => {
    const result = parse(items);
    expect(result.detectedColumns.map((c) => [c.label, c.kind])).toEqual([
      ["Date", "text"],
      ["Details", "text"],
      ["Spent", "text"],
      ["Received", "text"],
      ["Balance", "money"],
    ]);
    expect(result.rows).toHaveLength(0);
  });

  it("reads whole-number amounts once the columns are switched to amounts", () => {
    const columns = parse(items).detectedColumns.map((c) =>
      c.label === "Spent"
        ? { ...c, kind: "money" as const, role: "debit" as const }
        : c.label === "Received"
          ? { ...c, kind: "money" as const, role: "credit" as const }
          : c,
    );
    const result = parse(items, { columns });
    expect(result.rows.map((r) => [r.description, r.amount, r.direction])).toEqual([
      ["GROCERY 0456", "45.00", "DEBIT"],
      ["PAYROLL", "1200.00", "CREDIT"],
    ]);
  });
});

describe("parseStatement without a header", () => {
  it("reads a single signed amount column with month-name dates", () => {
    const items = [
      ...row(20, [[50, "Previous statement 01/15/2026"]]),
      ...row(60, [[50, "05 Jan"], [100, "AMAZON MKTP"], [380, "-45.10"]]),
      ...row(75, [[50, "07 Jan"], [100, "REFUND AMAZON"], [385, "12.00"]]),
      ...row(90, [[50, "Jan 9"], [100, "COFFEE"], [385, "3.50-"]]),
      ...row(105, [[50, "Jan 10, 2026"], [120, "PARKING"], [370, "(1,020.00)"]]),
    ];
    const result = parse(items);
    expect(result.signMode).toBe("signed");
    expect(result.detectedColumns.map((c) => c.role)).toEqual(["amount"]);
    expect(result.rows.map((r) => [r.date, r.description, r.amount, r.direction])).toEqual([
      ["2026-01-05", "AMAZON MKTP", "45.10", "DEBIT"],
      ["2026-01-07", "REFUND AMAZON", "12.00", "CREDIT"],
      ["2026-01-09", "COFFEE", "3.50", "DEBIT"],
      ["2026-01-10", "PARKING", "1020.00", "DEBIT"],
    ]);
  });

  it("detects CR suffixes, including a separate CR word", () => {
    const items = [
      ...row(60, [[50, "01/03"], [100, "PAYMENT THANK YOU"], [380, "500.00"], [422, "CR"]]),
      ...row(75, [[50, "01/04"], [100, "GROCERY OUTLET"], [385, "82.15"]]),
    ];
    const result = parse(items);
    expect(result.signMode).toBe("suffix");
    expect(result.rows.map((r) => [r.amount, r.direction])).toEqual([
      ["500.00", "CREDIT"],
      ["82.15", "DEBIT"],
    ]);
  });

  it("splits two amount columns into amount and balance when both appear on most lines", () => {
    const items = [
      ...row(60, [[50, "01/03"], [100, "DEPOSIT"], [300, "100.00"], [400, "600.00"]]),
      ...row(75, [[50, "01/04"], [100, "ATM"], [305, "-20.00"], [400, "580.00"]]),
    ];
    const result = parse(items);
    expect(result.detectedColumns.map((c) => c.role)).toEqual(["amount", "balance"]);
    expect(result.rows.map((r) => [r.direction, r.balanceCents])).toEqual([
      ["CREDIT", 60000],
      ["DEBIT", 58000],
    ]);
  });

  it("joins a dated line with an amount on the following line", () => {
    const items = [
      ...row(60, [[50, "01/03"], [100, "WIRE TRANSFER FROM"]]),
      ...row(72, [[100, "J SMITH"], [380, "-250.00"]]),
    ];
    const result = parse(items);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      date: "2026-01-03",
      description: "WIRE TRANSFER FROM J SMITH",
      amount: "250.00",
      direction: "DEBIT",
    });
  });

  it("reads day-first numeric dates when the first number exceeds 12", () => {
    const items = [
      ...row(60, [[50, "25/01/2026"], [120, "LUNCH"], [380, "-9.00"]]),
      ...row(75, [[50, "03/02/2026"], [120, "TAXI"], [380, "-15.00"]]),
    ];
    const lines = groupLines(items);
    expect(detectDateFormat(lines)).toBe("DMY");
    expect(parse(items).rows.map((r) => r.date)).toEqual(["2026-01-25", "2026-02-03"]);
  });
});

describe("reconcile", () => {
  it("recognises credit card statements where charges raise the balance", () => {
    const rows = [
      { amountCents: 5000, direction: "DEBIT" as const, balanceCents: null },
      { amountCents: 3000, direction: "CREDIT" as const, balanceCents: null },
    ];
    expect(reconcile(rows, { opening: 10000, closing: 12000 })).toMatchObject({
      status: "ok",
      convention: "liability",
    });
  });

  it("is unknown without balances", () => {
    const rows = [{ amountCents: 5000, direction: "DEBIT" as const, balanceCents: null }];
    expect(reconcile(rows, { opening: null, closing: null })).toEqual({ status: "unknown" });
  });
});

describe("templates", () => {
  const lines = groupLines(checking);

  it("suggests the bank name as a fingerprint and matches it", () => {
    expect(suggestFingerprint(lines)).toBe("FIRST NATIONAL BANK");
    const templates = [
      { id: 1, name: "Other", fingerprint: "Chase" },
      { id: 2, name: "First National", fingerprint: "first  national bank" },
    ];
    expect(matchTemplate(lines.map((l) => l.text).join("\n"), templates)?.id).toBe(2);
    expect(matchTemplate("nothing here", templates)).toBeNull();
  });

  it("suggests skip patterns without numbers", () => {
    const page = lines.find((l) => l.text === "Page 1 of 1")!;
    expect(suggestSkipPattern(page)).toBe("Page of");
  });
});
