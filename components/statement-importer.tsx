"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileTextIcon, PlusIcon, ScanTextIcon, UploadIcon } from "lucide-react";
import { toast } from "sonner";
import { CategorySelect, type CategoryOption } from "@/components/category-select";
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
import { groupLines } from "@/lib/import/lines";
import { parseStatement, suggestSkipPattern } from "@/lib/import/parse";
import { reconcile } from "@/lib/import/reconcile";
import { blankRow, buildReviewRows, toTransactionInput, type RowEdit } from "@/lib/import/review";
import { createSuggester, normalizeDescription, type CategoryHistory } from "@/lib/import/suggest";
import { documentText, matchTemplate, suggestFingerprint } from "@/lib/import/template";
import { DEFAULT_CONFIG, type DraftRow, type Line, type TemplateConfig } from "@/lib/import/types";
import { cn } from "@/lib/utils";

type Extraction = { fileName: string; lines: Line[]; pages: PageInfo[] };

const DAY_MS = 86_400_000;

function shiftDay(day: string, days: number) {
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

export function StatementImporter({
  categories,
  templates,
  history,
}: {
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
  const [forced, setForced] = useState<ReadonlySet<number>>(new Set());
  const [edits, setEdits] = useState<Record<string, RowEdit>>({});
  const [manualRows, setManualRows] = useState<DraftRow[]>([]);
  const [deleted, setDeleted] = useState<ReadonlySet<string>>(new Set());
  const [existing, setExisting] = useState<ExistingTransaction[]>([]);
  const [onlyProblems, setOnlyProblems] = useState(false);
  const [submitting, startSubmit] = useTransition();

  const result = useMemo(
    () => (extraction ? parseStatement(extraction.lines, config, { forcedRows: forced }) : null),
    [extraction, config, forced],
  );
  const suggest = useMemo(() => createSuggester(history, categories), [history, categories]);
  const rows = useMemo(
    () =>
      result
        ? buildReviewRows({ drafts: result.rows, manualRows, deleted, edits, suggest, existing })
        : [],
    [result, manualRows, deleted, edits, suggest, existing],
  );

  const dates = rows.map((r) => r.date).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
  const rangeFrom = dates.length ? shiftDay(dates[0], -1) : null;
  const rangeTo = dates.length ? shiftDay(dates[dates.length - 1], 1) : null;

  useEffect(() => {
    if (!rangeFrom || !rangeTo) return;
    let cancelled = false;
    findPossibleDuplicates(rangeFrom, rangeTo).then((found) => {
      if (!cancelled) setExisting(found);
    });
    return () => {
      cancelled = true;
    };
  }, [rangeFrom, rangeTo]);

  async function read(selected: File, pwd?: string) {
    setFile(selected);
    setReading(true);
    setReadError(null);
    setProgress(null);
    try {
      const { extractPdf, PdfPasswordError } = await import("@/lib/import/extract-pdf");
      try {
        const { items, pages } = await extractPdf(selected, { password: pwd, onProgress: setProgress });
        const lines = groupLines(items);
        if (lines.length === 0) {
          setReadError("No text could be read from this PDF.");
          return;
        }
        const matched = matchTemplate(documentText(lines), templates);
        setNeedsPassword(null);
        setPassword("");
        setExtraction({ fileName: selected.name, lines, pages });
        setTemplateId(matched?.id ?? null);
        setConfig(matched?.config ?? DEFAULT_CONFIG);
        setForced(new Set());
        setEdits({});
        setManualRows([]);
        setDeleted(new Set());
        setExisting([]);
        if (matched) toast.success(`Applied template "${matched.name}"`);
      } catch (e) {
        if (e instanceof PdfPasswordError) {
          setNeedsPassword(e.incorrect ? "incorrect" : "required");
          return;
        }
        throw e;
      }
    } catch (e) {
      console.error(e);
      setReadError("This file couldn't be read as a PDF.");
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

  function selectTemplate(id: number | null) {
    setTemplateId(id);
    setConfig(templates.find((t) => t.id === id)?.config ?? DEFAULT_CONFIG);
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
    if (!extraction) return;
    startSubmit(async () => {
      const res = await importTransactions({
        fileName: extraction.fileName,
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
            <span>
              {extraction.pages.length} page{extraction.pages.length === 1 ? "" : "s"}
            </span>
            {extraction.pages.map((p) => (
              <Badge key={p.page} variant={p.method === "ocr" ? "secondary" : "outline"}>
                {p.method === "ocr" && <ScanTextIcon className="size-3" />}
                Page {p.page}: {p.method === "ocr" ? "OCR" : "Text layer"}
              </Badge>
            ))}
            {result.period.to && (
              <span>
                · Statement dates up to {formatDay(inputToDate(result.period.to))}
              </span>
            )}
            {template && <span>· Template: {template.name}</span>}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="text-muted-foreground">
            Found {result.rows.length} transaction{result.rows.length === 1 ? "" : "s"} in{" "}
            {result.lines.length} lines.
            {ocrPages > 0 && " OCR text can contain misread characters, so check amounts carefully."}
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
      />

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
            {invalid.length > 0 && (
              <span className="text-rose-600 dark:text-rose-400">
                Fix {invalid.length} row{invalid.length === 1 ? "" : "s"} before importing
              </span>
            )}
            <Button onClick={submit} disabled={submitting || included.length === 0 || invalid.length > 0}>
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
    if (f.type !== "application/pdf" && !f.name.toLowerCase().endsWith(".pdf")) {
      toast.error("Please choose a PDF file");
      return;
    }
    onFile(f);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Upload a bank statement</CardTitle>
        <CardDescription>
          The PDF is read entirely in your browser. Scanned pages are run through local OCR.
          Nothing is uploaded until you import the reviewed rows.
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
            <span className="font-medium text-foreground">Choose a PDF</span> or drag it here
          </span>
          <input
            type="file"
            accept="application/pdf,.pdf"
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
