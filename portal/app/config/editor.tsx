"use client";

import { useState, useTransition } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Eye, Save, RotateCcw } from "lucide-react";
import type { PwagentConfig } from "@/lib/config";
import type { DiffLine } from "@/lib/config";
import { previewConfig, saveConfig } from "./actions";

interface Props {
  initial: PwagentConfig;
}

const KNOWN_MODELS = ["claude-sonnet-4.5", "claude-opus-4.5", "claude-haiku-4.5", "claude-sonnet-4.6", "gpt-5", "gpt-5-mini", "o3-mini"];
const LOG_LEVELS = ["error", "warn", "info", "debug"];
const SURFACES = ["cli", "chat", "either", "noop"];

export function ConfigEditor({ initial }: Props) {
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState<Record<string, string>>({
    "provider.clientName": initial.provider?.clientName ?? "pwagent",
    "provider.model": initial.provider?.model ?? "claude-sonnet-4.5",
    "provider.logLevel": initial.provider?.logLevel ?? "error",
    "ado.org": initial.ado?.org ?? "",
    "ado.project": initial.ado?.project ?? "",
    "ado.defaultRepo": initial.ado?.defaultRepo ?? "",
    "audit.enabled": String(initial.audit?.enabled ?? true),
    "audit.path": initial.audit?.path ?? "~/.pwagent/audit/events.jsonl",
    "defaultSurface": initial.defaultSurface ?? "cli",
  });
  const [diff, setDiff] = useState<DiffLine[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const onPreview = () =>
    startTransition(async () => {
      setError(null);
      setSavedMsg(null);
      const r = await previewConfig(draft);
      if (!r.ok) {
        setError(r.error ?? "validation failed");
        setDiff(null);
      } else {
        setDiff(r.diff ?? []);
      }
    });

  const onSave = () =>
    startTransition(async () => {
      setError(null);
      const r = await saveConfig(draft);
      if (!r.ok) {
        setError(r.error ?? "save failed");
      } else {
        setSavedMsg(r.changed ? `saved ${r.changed} line${r.changed === 1 ? "" : "s"}` : "no changes to save");
        setDiff(null);
      }
    });

  const onReset = () => {
    setDraft({
      "provider.clientName": initial.provider?.clientName ?? "pwagent",
      "provider.model": initial.provider?.model ?? "claude-sonnet-4.5",
      "provider.logLevel": initial.provider?.logLevel ?? "error",
      "ado.org": initial.ado?.org ?? "",
      "ado.project": initial.ado?.project ?? "",
      "ado.defaultRepo": initial.ado?.defaultRepo ?? "",
      "audit.enabled": String(initial.audit?.enabled ?? true),
      "audit.path": initial.audit?.path ?? "~/.pwagent/audit/events.jsonl",
      defaultSurface: initial.defaultSurface ?? "cli",
    });
    setDiff(null);
    setError(null);
    setSavedMsg(null);
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Provider</CardTitle>
            <CardDescription>GitHub Copilot via @github/copilot-sdk.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Field
              label="Client name"
              hint="sent to the Copilot telemetry pipeline"
              value={draft["provider.clientName"]}
              onChange={(v) => setDraft({ ...draft, "provider.clientName": v })}
            />
            <SelectField
              label="Default model"
              options={KNOWN_MODELS}
              value={draft["provider.model"]}
              onChange={(v) => setDraft({ ...draft, "provider.model": v })}
            />
            <SelectField
              label="SDK log level"
              options={LOG_LEVELS}
              value={draft["provider.logLevel"]}
              onChange={(v) => setDraft({ ...draft, "provider.logLevel": v })}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Azure DevOps</CardTitle>
            <CardDescription>Used by the ado skill for work items + PRs.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Field
              label="Org URL"
              hint="e.g. https://dev.azure.com/contoso"
              value={draft["ado.org"]}
              onChange={(v) => setDraft({ ...draft, "ado.org": v })}
            />
            <Field
              label="Project"
              value={draft["ado.project"]}
              onChange={(v) => setDraft({ ...draft, "ado.project": v })}
            />
            <Field
              label="Default repo"
              value={draft["ado.defaultRepo"]}
              onChange={(v) => setDraft({ ...draft, "ado.defaultRepo": v })}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Audit</CardTitle>
            <CardDescription>JSONL append-only log of every run.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <SelectField
              label="Enabled"
              options={["true", "false"]}
              value={draft["audit.enabled"]}
              onChange={(v) => setDraft({ ...draft, "audit.enabled": v })}
            />
            <Field
              label="Path"
              hint="defaults to ~/.pwagent/audit/events.jsonl"
              value={draft["audit.path"]}
              onChange={(v) => setDraft({ ...draft, "audit.path": v })}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Default surface</CardTitle>
            <CardDescription>Where scheduler jobs dispatch by default.</CardDescription>
          </CardHeader>
          <CardContent>
            <SelectField
              label="Surface"
              options={SURFACES}
              value={draft["defaultSurface"]}
              onChange={(v) => setDraft({ ...draft, defaultSurface: v })}
            />
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={onPreview} disabled={pending} variant="outline">
          <Eye className="h-4 w-4" />
          Preview diff
        </Button>
        <Button onClick={onSave} disabled={pending}>
          <Save className="h-4 w-4" />
          Save
        </Button>
        <Button onClick={onReset} disabled={pending} variant="ghost">
          <RotateCcw className="h-4 w-4" />
          Reset
        </Button>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {savedMsg && <p className="text-sm text-green-600">{savedMsg}</p>}
      </div>

      {diff && (
        <Card>
          <CardHeader>
            <CardTitle>Diff preview</CardTitle>
            <CardDescription>
              {diff.filter((d) => d.type !== "context").length === 0
                ? "No changes."
                : `${diff.filter((d) => d.type !== "context").length} line(s) changed.`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="overflow-x-auto rounded-md bg-muted p-3 font-mono text-xs leading-relaxed">
              {diff
                .map((d) => {
                  if (d.type === "context") return ` ${d.prev}`;
                  if (d.type === "added") return `+${d.next}`;
                  if (d.type === "removed") return `-${d.prev}`;
                  return `±${d.prev}\n+${d.next}`;
                })
                .join("\n")}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
}) {
  return (
    <label className="space-y-1 text-xs block">
      <div className="flex items-center justify-between">
        <span className="font-medium text-foreground">{label}</span>
        {hint && <span className="text-muted-foreground">{hint}</span>}
      </div>
      <input
        type="text"
        className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm font-mono"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

function SelectField({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="space-y-1 text-xs block">
      <span className="font-medium text-foreground">{label}</span>
      <select
        className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm font-mono"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </label>
  );
}
