"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileTextIcon, PlusIcon, ScanTextIcon, UploadIcon } from "lucide-react";
import { toast } from "sonner";
import { AccountSelect, type AccountOption } from "@/components/account-select";
import { CategorySelect, type CategoryOption } from "@/components/category-select";
import { ImportCategoryMap, type SourceCategoryValue } from "@/components/import-category-map";
import { ImportRawLines } from "@/components/import-raw-lines";
import { ImportReviewTable } from "@/components/import-review-table";
import { ImportSettings, type ImportTemplate } from "@/components/import-settings";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { findPossibleDuplicates, importTransactions, undoImport } from "@/lib/actions/import";
import { formatCents, formatDay, inputToDate } from "@/lib/format";
import type { ExistingTransaction } from "@/lib/import/duplicates";
import type { ExtractProgress, PageInfo } from "@/lib/import/extract-pdf";
import { createCategoryMatcher, normalizeCategoryLabel } from "@/lib/import/category-match";
import { CsvImportError, extractCsv } from "@/lib/import/extract-csv";
import { groupLines } from "@/lib/import/lines";
import { parseStatement, suggestSkipPattern } from "@/lib/import/parse";
import { reconcile } from "@/lib/import/reconcile";
import { blankRow, buildReviewRows, toTransactionInput, type RowEdit } from "@/lib/import/review";
import { createSuggester, normalizeDescription, type CategoryHistory } from "@/lib/import/suggest";
import { documentText, matchTemplate, suggestFingerprint } from "@/lib/import/template";
import {
  DEFAULT_CONFIG,
  type Column,
  type DraftRow,
  type Line,
  type TemplateConfig,
} from "@/lib/import/types";
import { cn } from "@/lib/utils";

type Extraction = {
  fileName: string;
  source: "pdf" | "csv";
  lines: Line[];
  pages: PageInfo[];
  detectedColumns?: Column[];
  headerLineId?: number;
  recordCount?: number;
};

const DAY_MS = 86_400_000;
const NO_EXISTING: ExistingTransaction[] = [];

function shiftDay(day: string, days: number) {
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

export function StatementImporter({
  accounts,
  categories,
  templates,
  history,
}: {
  accounts: AccountOption[];
  categories: CategoryOption[];
  templates: ImportTemplate[];
  history: CategoryHistory;
}) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [reading, setReading] = useState(false);
  const [progress, setProgress] = useState<ExtractProgress | null>(null);
  const [needsPassword, setNeedsPassword] = useState<null | "required" | "incorrect">(null);
  const [password, setPassword] = useState("");
  const [readError, setReadError] = useState<string | null>(null);

  const [extraction, setExtraction] = useState<Extraction | null>(null);
  const [config, setConfig] = useState<TemplateConfig>(DEFAULT_CONFIG);
  const [templateId, setTemplateId] = useState<number | null>(null);
  const [accountId, setAccountId] = useState<number | null>(
    accounts.length === 1 ? accounts[0].id : null,
  );
  const [forced, setForced] = useState<ReadonlySet<number>>(new Set());
  const [edits, setEdits] = useState<Record<string, RowEdit>>({});
  const [manualRows, setManualRows] = useState<DraftRow[]>([]);
  const [deleted, setDeleted] = useState<ReadonlySet<string>>(new Set());
  const [fetched, setFetched] = useState<{
    accountId: number | null;
    rows: ExistingTransaction[];
  }>({ accountId: null, rows: NO_EXISTING });
  const [onlyProblems, setOnlyProblems] = useState(false);
  const [submitting, startSubmit] = useTransition();

  const result = useMemo(
    () =>
      extraction
        ? parseStatement(extraction.lines, config, {
            forcedRows: forced,
            detectedColumns: extraction.detectedColumns,
            headerLineId: extraction.headerLineId,
          })
        : null,
    [extraction, config, forced],
  );
  const suggest = useMemo(() => createSuggester(history, categories), [history, categories]);
  const matchCategory = useMemo(() => createCategoryMatcher(categories), [categories]);
  const sourceCategories = useMemo(() => {
    const categoryIds = new Set(categories.map((c) => c.id));
    const values = new Map<string, SourceCategoryValue>();
    for (const draft of result?.rows ?? []) {
      const key = normalizeCategoryLabel(draft.sourceCategory);
      if (!key) continue;
      const existingValue = values.get(key);
      if (existingValue) {
        existingValue.count++;
        continue;
      }
      // A saved mapping may point at a category deleted since the template was saved
      const saved = config.categoryMap[key];
      values.set(key, {
        key,
        label: draft.sourceCategory.trim(),
        count: 1,
        savedId: saved !== undefined && categoryIds.has(saved) ? saved : null,
        match: matchCategory(draft.sourceCategory),
      });
    }
    return values;
  }, [result, config.categoryMap, categories, matchCategory]);
  const mapCategory = useCallback(
    (value: string) => {
      const entry = sourceCategories.get(normalizeCategoryLabel(value));
      return entry ? (entry.savedId ?? entry.match?.categoryId ?? null) : null;
    },
    [sourceCategories],
  );
  // Ignore results fetched for a previously chosen account
  const existing = fetched.accountId === accountId ? fetched.rows : NO_EXISTING;
  const rows = useMemo(
    () =>
      result
        ? buildReviewRows({
            drafts: result.rows,
            manualRows,
            deleted,
            edits,
            suggest,
            mapCategory,
            existing,
          })
        : [],
    [result, manualRows, deleted, edits, suggest, mapCategory, existing],
  );

  const dates = rows.map((r) => r.date).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
  const rangeFrom = dates.length ? shiftDay(dates[0], -1) : null;
  const rangeTo = dates.length ? shiftDay(dates[dates.length - 1], 1) : null;

  useEffect(() => {
    if (!accountId || !rangeFrom || !rangeTo) return;
    let cancelled = false;
    findPossibleDuplicates(rangeFrom, rangeTo, accountId).then((found) => {
      if (!cancelled) setFetched({ accountId, rows: found });
    });
    return () => {
      cancelled = true;
    };
  }, [accountId, rangeFrom, rangeTo]);

  function applyExtraction(next: Extraction) {
    const matched = matchTemplate(
      documentText(next.lines),
      templates.filter((template) => template.accountId === accountId),
    );
    setNeedsPassword(null);
    setPassword("");
    setExtraction(next);
    setTemplateId(matched?.id ?? null);
    setConfig(matched?.config ?? DEFAULT_CONFIG);
    setForced(new Set());
    setEdits({});
    setManualRows([]);
    setDeleted(new Set());
    setFetched({ accountId: null, rows: NO_EXISTING });
    if (matched) toast.success(`Applied template "${matched.name}"`);
  }

  async function read(selected: File, pwd?: string) {
    const isCsv = selected.name.toLowerCase().endsWith(".csv") || selected.type === "text/csv";
    setFile(selected);
    setReading(true);
    setReadError(null);
    setProgress(null);
    try {
      if (isCsv) {
        const extracted = extractCsv(await selected.text());
        applyExtraction({
          fileName: selected.name,
          source: "csv",
          lines: extracted.lines,
          pages: [],
          detectedColumns: extracted.columns,
          headerLineId: extracted.headerLineId,
          recordCount: extracted.recordCount,
        });
      } else {
        const { extractPdf, PdfPasswordError } = await import("@/lib/import/extract-pdf");
        try {
          const { items, pages } = await extractPdf(selected, {
            password: pwd,
            onProgress: setProgress,
          });
          const lines = groupLines(items);
          if (lines.length === 0) {
            setReadError("No text could be read from this PDF.");
            return;
          }
          applyExtraction({ fileName: selected.name, source: "pdf", lines, pages });
        } catch (e) {
          if (e instanceof PdfPasswordError) {
            setNeedsPassword(e.incorrect ? "incorrect" : "required");
            return;
          }
          throw e;
        }
      }
    } catch (e) {
      console.error(e);
      setReadError(
        isCsv
          ? e instanceof CsvImportError
            ? e.message
            : "This file couldn't be read as a CSV."
          : "This file couldn't be read as a PDF.",
      );
    } finally {
      setReading(false);
    }
  }

  function startOver() {
    setExtraction(null);
    setFile(null);
    setNeedsPassword(null);
    setReadError(null);
  }

  function selectAccount(id: number) {
    setAccountId(id);
    const selectedTemplate = templates.find((t) => t.id === templateId);
    if (selectedTemplate && selectedTemplate.accountId !== id) {
      setTemplateId(null);
      setConfig(DEFAULT_CONFIG);
    }
  }

  function selectTemplate(id: number | null) {
    const t = templates.find((t) => t.id === id && t.accountId === accountId);
    setTemplateId(t?.id ?? null);
    setConfig(t?.config ?? DEFAULT_CONFIG);
  }

  function editRow(key: string, edit: RowEdit) {
    setEdits((prev) => ({ ...prev, [key]: { ...prev[key], ...edit } }));
  }

  /** Sets a row's category and copies it to rows with the same merchant that weren't set by hand. */
  function setCategory(key: string, categoryId: string) {
    const source = rows.find((r) => r.key === key);
    const merchant = source ? normalizeDescription(source.description) : "";
    setEdits((prev) => {
      const next = { ...prev, [key]: { ...prev[key], categoryId } };
      if (!merchant) return next;
      for (const r of rows) {
        if (r.key === key || prev[r.key]?.categoryId !== undefined) continue;
        if (normalizeDescription(r.description) === merchant) {
          next[r.key] = { ...prev[r.key], categoryId };
        }
      }
      return next;
    });
  }

  function setCategoryForChecked(categoryId: string) {
    setEdits((prev) => {
      const next = { ...prev };
      for (const r of rows) if (r.include) next[r.key] = { ...prev[r.key], categoryId };
      return next;
    });
  }

  function toggleAll(include: boolean) {
    setEdits((prev) => {
      const next = { ...prev };
      for (const r of visibleRows) next[r.key] = { ...prev[r.key], include };
      return next;
    });
  }

  function deleteRow(key: string) {
    setDeleted((prev) => new Set(prev).add(key));
  }

  function addRow() {
    const lastDate = rows.findLast((r) => r.date)?.date ?? new Date().toISOString().slice(0, 10);
    setManualRows((prev) => [...prev, blankRow(lastDate)]);
  }

  function forceLine(lineId: number, force: boolean) {
    setForced((prev) => {
      const next = new Set(prev);
      if (force) next.add(lineId);
      else next.delete(lineId);
      return next;
    });
  }

  function skipSimilar(line: Line) {
    const pattern = suggestSkipPattern(line);
    if (!pattern) {
      toast.error("This line has no words to match on. Add a skip pattern by hand.");
      return;
    }
    if (!config.skipPatterns.includes(pattern)) {
      setConfig({ ...config, skipPatterns: [...config.skipPatterns, pattern] });
    }
    forceLine(line.id, false);
    toast.success(`Skipping lines containing "${pattern}"`);
  }

  const included = rows.filter((r) => r.include);
  const invalid = included.filter((r) => r.errors.length > 0);
  const debits = included.filter((r) => r.direction === "DEBIT").reduce((s, r) => s + r.amountCents, 0);
  const credits = included.filter((r) => r.direction === "CREDIT").reduce((s, r) => s + r.amountCents, 0);
  const check = result
    ? reconcile(
        rows.filter((r) => r.amountCents > 0),
        result.balances,
      )
    : ({ status: "unknown" } as const);
  const visibleRows = onlyProblems
    ? rows.filter((r) => (r.include && r.errors.length > 0) || r.warnings.length > 0 || r.duplicate)
    : rows;

  function submit() {
    if (!extraction || !accountId) return;
    startSubmit(async () => {
      const res = await importTransactions({
        fileName: extraction.fileName,
        accountId,
        rows: included.map(toTransactionInput),
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`Imported ${res.count} transaction${res.count === 1 ? "" : "s"}`, {
        duration: 10_000,
        action: {
          label: "Undo",
          onClick: async () => {
            const undo = await undoImport(res.batchId);
            if (undo.ok) toast.success("Import undone");
            else toast.error(undo.error);
          },
        },
      });
      router.push("/transactions");
    });
  }

  if (!extraction || !result) {
    return (
      <UploadCard
        file={file}
        reading={reading}
        progress={progress}
        error={readError}
        needsPassword={needsPassword}
        password={password}
        onPasswordChange={setPassword}
        onFile={(f) => read(f)}
        onPasswordSubmit={() => file && read(file, password)}
      />
    );
  }

  const template = templates.find((t) => t.id === templateId) ?? null;
  const ocrPages = extraction.pages.filter((p) => p.method === "ocr").length;

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileTextIcon className="size-4" /> {extraction.fileName}
          </CardTitle>
          <CardDescription className="flex flex-wrap items-center gap-2">
            {extraction.source === "pdf" ? (
              <>
                <span>
                  {extraction.pages.length} page{extraction.pages.length === 1 ? "" : "s"}
                </span>
                {extraction.pages.map((p) => (
                  <Badge key={p.page} variant={p.method === "ocr" ? "secondary" : "outline"}>
                    {p.method === "ocr" && <ScanTextIcon className="size-3" />}
                    Page {p.page}: {p.method === "ocr" ? "OCR" : "Text layer"}
                  </Badge>
                ))}
              </>
            ) : (
              <span>{extraction.recordCount} CSV records</span>
            )}
            {result.period.to && (
              <span>
                · Statement dates up to {formatDay(inputToDate(result.period.to))}
              </span>
            )}
            {template && <span>· Template: {template.name}</span>}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 text-sm">
          <div className="flex w-full flex-wrap items-center gap-3">
            <Label htmlFor="import-account">Import into account</Label>
            <AccountSelect
              id="import-account"
              accounts={accounts}
              value={accountId ? String(accountId) : undefined}
              onChange={(id) => selectAccount(Number(id))}
              className="w-64"
            />
            {accounts.length === 0 && (
              <Link href="/accounts" className="text-muted-foreground underline">
                Create an account first
              </Link>
            )}
          </div>
          <span className="text-muted-foreground">
            Found {result.rows.length} transaction{result.rows.length === 1 ? "" : "s"} in{" "}
            {result.lines.length} lines.
            {extraction.source === "pdf" &&
              ocrPages > 0 &&
              " OCR text can contain misread characters, so check amounts carefully."}
          </span>
          <Button variant="outline" size="sm" onClick={startOver}>
            <UploadIcon /> Choose another file
          </Button>
        </CardContent>
      </Card>

      <ImportSettings
        result={result}
        config={config}
        onConfigChange={setConfig}
        onReset={() => {
          setConfig(template?.config ?? DEFAULT_CONFIG);
          setForced(new Set());
        }}
        templates={templates}
        templateId={templateId}
        onTemplateSelect={selectTemplate}
        onTemplateIdChange={setTemplateId}
        suggestedFingerprint={suggestFingerprint(extraction.lines)}
        accounts={accounts}
        accountId={accountId}
        showColumnCoordinates={extraction.source === "pdf"}
      />

      {sourceCategories.size > 0 && (
        <ImportCategoryMap
          values={[...sourceCategories.values()].sort(
            (a, b) => b.count - a.count || a.label.localeCompare(b.label),
          )}
          categories={categories}
          onMap={(key, categoryId) =>
            setConfig({ ...config, categoryMap: { ...config.categoryMap, [key]: categoryId } })
          }
          onClear={(key) => {
            const categoryMap = { ...config.categoryMap };
            delete categoryMap[key];
            setConfig({ ...config, categoryMap });
          }}
        />
      )}

      <Tabs defaultValue="review">
        <TabsList>
          <TabsTrigger value="review">Review rows ({rows.length})</TabsTrigger>
          <TabsTrigger value="lines">Raw lines ({result.lines.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="review" className="grid gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={onlyProblems}
                onChange={(e) => setOnlyProblems(e.target.checked)}
              />
              Only rows needing attention
            </label>
            <div className="ml-auto flex items-center gap-2">
              <CategorySelect
                categories={categories}
                value=""
                onChange={setCategoryForChecked}
                placeholder={`Set category for ${included.length} checked`}
                className="w-64"
                disabled={included.length === 0}
              />
              <Button variant="outline" onClick={addRow}>
                <PlusIcon /> Add row
              </Button>
            </div>
          </div>
          <ImportReviewTable
            rows={visibleRows}
            categories={categories}
            onEdit={editRow}
            onCategory={setCategory}
            onDelete={deleteRow}
            onToggleAll={toggleAll}
          />
        </TabsContent>
        <TabsContent value="lines">
          <ImportRawLines
            result={result}
            forced={forced}
            onForce={forceLine}
            onSkipSimilar={skipSimilar}
          />
        </TabsContent>
      </Tabs>

      <div className="sticky bottom-0 z-10 -mx-4 border-t bg-background/95 px-4 py-3 backdrop-blur">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <span>
            <strong>{included.length}</strong> of {rows.length} rows checked
          </span>
          <span>
            Debits <strong className="tabular-nums">{formatCents(debits)}</strong>
          </span>
          <span>
            Credits{" "}
            <strong className="tabular-nums text-emerald-600 dark:text-emerald-400">
              {formatCents(credits)}
            </strong>
          </span>
          <ReconcileBadge check={check} />
          <div className="ml-auto flex items-center gap-3">
            {!accountId ? (
              <span className="text-rose-600 dark:text-rose-400">
                Choose an account to import into
              </span>
            ) : (
              invalid.length > 0 && (
                <span className="text-rose-600 dark:text-rose-400">
                  Fix {invalid.length} row{invalid.length === 1 ? "" : "s"} before importing
                </span>
              )
            )}
            <Button
              onClick={submit}
              disabled={submitting || !accountId || included.length === 0 || invalid.length > 0}
            >
              {submitting ? "Importing..." : `Import ${included.length} transaction${included.length === 1 ? "" : "s"}`}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ReconcileBadge({ check }: { check: ReturnType<typeof reconcile> }) {
  if (check.status === "unknown") {
    return <span className="text-muted-foreground">No statement balances found to check against</span>;
  }
  const detail = `Opening ${formatCents(check.opening)} → closing ${formatCents(check.closing)}`;
  if (check.status === "ok") {
    return (
      <Badge variant="outline" className="border-emerald-500 text-emerald-700 dark:text-emerald-400" title={detail}>
        Balances reconcile
      </Badge>
    );
  }
  return (
    <Badge variant="destructive" title={detail}>
      Off by {formatCents(Math.abs(check.diff))}: a row may be missing or misread
    </Badge>
  );
}

function UploadCard({
  file,
  reading,
  progress,
  error,
  needsPassword,
  password,
  onPasswordChange,
  onFile,
  onPasswordSubmit,
}: {
  file: File | null;
  reading: boolean;
  progress: ExtractProgress | null;
  error: string | null;
  needsPassword: null | "required" | "incorrect";
  password: string;
  onPasswordChange: (v: string) => void;
  onFile: (file: File) => void;
  onPasswordSubmit: () => void;
}) {
  const [dragging, setDragging] = useState(false);

  function accept(files: FileList | null) {
    const f = files?.[0];
    if (!f) return;
    const name = f.name.toLowerCase();
    const isPdf = f.type === "application/pdf" || name.endsWith(".pdf");
    const isCsv = f.type === "text/csv" || name.endsWith(".csv");
    if (!isPdf && !isCsv) {
      toast.error("Please choose a PDF or CSV file");
      return;
    }
    onFile(f);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Upload a bank statement</CardTitle>
        <CardDescription>
          PDFs are read in your browser, with scanned pages processed using local OCR. CSV files are
          parsed in your browser. Nothing is uploaded until you import the reviewed rows.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <label
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            accept(e.dataTransfer.files);
          }}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-10 text-center text-sm text-muted-foreground transition-colors hover:bg-muted/50",
            dragging && "border-primary bg-muted/50",
            reading && "pointer-events-none opacity-60",
          )}
        >
          <UploadIcon className="size-6" />
          <span>
            <span className="font-medium text-foreground">Choose a PDF or CSV</span> or drag it here
          </span>
          <input
            type="file"
            accept="application/pdf,.pdf,text/csv,.csv"
            className="sr-only"
            disabled={reading}
            onChange={(e) => {
              accept(e.target.files);
              e.target.value = "";
            }}
          />
        </label>

        {reading && (
          <p className="text-sm text-muted-foreground">
            Reading {file?.name}
            {progress &&
              ` — page ${progress.page} of ${progress.pageCount}${
                progress.stage === "ocr"
                  ? ` (OCR ${Math.round((progress.ocrProgress ?? 0) * 100)}%)`
                  : ""
              }`}
            ...
          </p>
        )}
        {error && <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}

        {needsPassword && !reading && (
          <form
            className="grid max-w-sm gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              onPasswordSubmit();
            }}
          >
            <Label htmlFor="pdf-password">
              {needsPassword === "incorrect"
                ? "That password didn't work. Try again:"
                : `${file?.name} is password protected`}
            </Label>
            <div className="flex gap-2">
              <Input
                id="pdf-password"
                type="password"
                value={password}
                onChange={(e) => onPasswordChange(e.target.value)}
                autoFocus
              />
              <Button type="submit">Open</Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
