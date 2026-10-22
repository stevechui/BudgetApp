"use client";

import { useState, useTransition } from "react";
import { RotateCcwIcon, SaveIcon, Trash2Icon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { deleteTemplate, saveTemplate, updateTemplate } from "@/lib/actions/import";
import {
  MONEY_ROLES,
  TEXT_ROLES,
  type Column,
  type ColumnRole,
  type DateFormat,
  type ParseResult,
  type SignMode,
  type TemplateConfig,
} from "@/lib/import/types";

export type ImportTemplate = {
  id: number;
  name: string;
  fingerprint: string;
  config: TemplateConfig;
};

const ROLE_LABELS: Record<ColumnRole, string> = {
  date: "Date",
  description: "Description",
  debit: "Debit (money out)",
  credit: "Credit (money in)",
  amount: "Signed amount",
  balance: "Running balance",
  ignore: "Ignore",
};

const SIGN_LABELS: Record<SignMode, string> = {
  auto: "Auto-detect",
  columns: "Separate debit/credit columns",
  signed: "Negative amounts are debits",
  suffix: "Amounts marked CR are credits",
};

const DATE_LABELS: Record<DateFormat, string> = {
  auto: "Auto-detect",
  MDY: "Month first (MM/DD)",
  DMY: "Day first (DD/MM)",
};

export function ImportSettings({
  result,
  config,
  onConfigChange,
  onReset,
  templates,
  templateId,
  onTemplateSelect,
  onTemplateIdChange,
  suggestedFingerprint,
}: {
  result: ParseResult;
  config: TemplateConfig;
  onConfigChange: (config: TemplateConfig) => void;
  onReset: () => void;
  templates: ImportTemplate[];
  templateId: number | null;
  /** Switches template and applies its settings */
  onTemplateSelect: (id: number | null) => void;
  /** Records a saved or deleted template without changing the current settings */
  onTemplateIdChange: (id: number | null) => void;
  suggestedFingerprint: string;
}) {
  const [pattern, setPattern] = useState("");
  const [pending, startTransition] = useTransition();
  const template = templates.find((t) => t.id === templateId) ?? null;

  function setRole(index: number, role: ColumnRole) {
    const columns: Column[] = result.columns.map((c, i) => (i === index ? { ...c, role } : c));
    onConfigChange({ ...config, columns });
  }

  function addPattern() {
    const p = pattern.trim();
    if (!p || config.skipPatterns.includes(p)) return;
    onConfigChange({ ...config, skipPatterns: [...config.skipPatterns, p] });
    setPattern("");
  }

  function removeTemplate() {
    if (!template) return;
    startTransition(async () => {
      const res = await deleteTemplate(template.id);
      if (res.ok) {
        toast.success(`Deleted template "${template.name}"`);
        onTemplateIdChange(null);
      } else toast.error(res.error);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Extraction settings</CardTitle>
        <CardDescription>
          Correct how the statement is read. Changes re-parse instantly; save them as a template
          so this bank&apos;s statements parse correctly next time.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        <div className="grid gap-2">
          <Label>Template</Label>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={templateId ? String(templateId) : "none"}
              onValueChange={(v) => onTemplateSelect(v === "none" ? null : Number(v))}
            >
              <SelectTrigger className="w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No template (auto-detect)</SelectItem>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={String(t.id)}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <TemplateDialog
              config={config}
              template={template}
              suggestedFingerprint={suggestedFingerprint}
              onSaved={onTemplateIdChange}
            />
            {template && (
              <Button variant="ghost" size="sm" onClick={removeTemplate} disabled={pending}>
                <Trash2Icon /> Delete template
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={onReset}>
              <RotateCcwIcon /> Reset
            </Button>
          </div>
        </div>

        <div className="grid gap-2">
          <Label>Columns</Label>
          {result.columns.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No columns detected. Amounts are read from anywhere on each dated line.
            </p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {result.columns.map((c, i) => (
                <div key={`${c.label}-${i}`} className="flex items-center gap-2 rounded-lg border p-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium" title={c.label}>
                      {c.label}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {c.kind === "money" ? "Amounts" : "Text"} · x {Math.round(c.x0)}–{Math.round(c.x1)}
                    </div>
                  </div>
                  <Select value={c.role} onValueChange={(v) => setRole(i, v as ColumnRole)}>
                    <SelectTrigger size="sm" className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(c.kind === "money" ? MONEY_ROLES : TEXT_ROLES).map((r) => (
                        <SelectItem key={r} value={r}>
                          {ROLE_LABELS[r]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="grid gap-2">
            <Label>Date format</Label>
            <Select
              value={config.dateFormat}
              onValueChange={(v) => onConfigChange({ ...config, dateFormat: v as DateFormat })}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(DATE_LABELS) as DateFormat[]).map((k) => (
                  <SelectItem key={k} value={k}>
                    {DATE_LABELS[k]}
                    {k === "auto" && ` (${result.dateFormat === "MDY" ? "MM/DD" : "DD/MM"})`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>Debit or credit</Label>
            <Select
              value={config.signMode}
              onValueChange={(v) => onConfigChange({ ...config, signMode: v as SignMode })}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(SIGN_LABELS) as SignMode[]).map((k) => (
                  <SelectItem key={k} value={k}>
                    {SIGN_LABELS[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {config.signMode === "auto" && (
              <p className="text-xs text-muted-foreground">Detected: {SIGN_LABELS[result.signMode]}</p>
            )}
          </div>
          <label className="flex items-start gap-2 pt-6 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 size-4 accent-primary"
              checked={config.flipDirection}
              onChange={(e) => onConfigChange({ ...config, flipDirection: e.target.checked })}
            />
            <span>
              Flip debit and credit
              <span className="block text-xs text-muted-foreground">
                For credit card statements where charges are shown as positive amounts.
              </span>
            </span>
          </label>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="skip-pattern">Skip lines containing</Label>
          <div className="flex flex-wrap gap-2">
            {config.skipPatterns.length === 0 && (
              <span className="text-sm text-muted-foreground">No skip patterns.</span>
            )}
            {config.skipPatterns.map((p) => (
              <Badge key={p} variant="secondary" className="gap-1">
                {p}
                <button
                  type="button"
                  aria-label={`Remove ${p}`}
                  onClick={() =>
                    onConfigChange({ ...config, skipPatterns: config.skipPatterns.filter((x) => x !== p) })
                  }
                >
                  <XIcon className="size-3" />
                </button>
              </Badge>
            ))}
          </div>
          <form
            className="flex max-w-md gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              addPattern();
            }}
          >
            <Input
              id="skip-pattern"
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
              placeholder="e.g. Daily balance"
            />
            <Button type="submit" variant="outline">
              Add
            </Button>
          </form>
        </div>
      </CardContent>
    </Card>
  );
}

function TemplateDialog({
  config,
  template,
  suggestedFingerprint,
  onSaved,
}: {
  config: TemplateConfig;
  template: ImportTemplate | null;
  suggestedFingerprint: string;
  onSaved: (id: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [fingerprint, setFingerprint] = useState("");
  const [pending, startTransition] = useTransition();

  function onOpenChange(next: boolean) {
    if (next) {
      setName(template?.name ?? "");
      setFingerprint(template?.fingerprint ?? suggestedFingerprint);
    }
    setOpen(next);
  }

  function submit(asNew: boolean) {
    startTransition(async () => {
      const input = { name, fingerprint, config };
      if (template && !asNew) {
        const res = await updateTemplate(template.id, input);
        if (!res.ok) return void toast.error(res.error);
        toast.success(`Updated template "${name}"`);
        onSaved(template.id);
      } else {
        const res = await saveTemplate(input);
        if (!res.ok) return void toast.error(res.error);
        toast.success(`Saved template "${name}"`);
        onSaved(res.id);
      }
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <SaveIcon /> {template ? "Update template" : "Save as template"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{template ? "Update template" : "Save as template"}</DialogTitle>
          <DialogDescription>
            The current settings are applied automatically to future statements that contain the
            identifying text.
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit(false);
          }}
        >
          <div className="grid gap-2">
            <Label htmlFor="template-name">Name</Label>
            <Input
              id="template-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Chase Checking"
              autoFocus
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="template-fingerprint">Identifying text</Label>
            <Input
              id="template-fingerprint"
              value={fingerprint}
              onChange={(e) => setFingerprint(e.target.value)}
              placeholder="Text printed on every statement, e.g. the bank's name"
            />
          </div>
          <DialogFooter>
            {template && (
              <Button type="button" variant="outline" onClick={() => submit(true)} disabled={pending}>
                Save as new
              </Button>
            )}
            <Button type="submit" disabled={pending}>
              {pending ? "Saving..." : template ? "Update" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
