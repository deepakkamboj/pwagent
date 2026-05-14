"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, X, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { PwagentConfig } from "@/lib/config";
import { saveRepos } from "./reposActions";

type RepoEntry = NonNullable<PwagentConfig["repos"]>[number];

export function ReposEditor({ initial }: { initial: RepoEntry[] }) {
  const router = useRouter();
  const [repos, setRepos] = useState<RepoEntry[]>(initial);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<RepoEntry>({ name: "", path: "", type: "github", defaultBranch: "main" });
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | undefined>();
  const [savedMsg, setSavedMsg] = useState<string | undefined>();

  const dirty = JSON.stringify(repos) !== JSON.stringify(initial);

  const onAdd = () => {
    if (!draft.name.trim() || !draft.path.trim()) {
      setError("name and path are required");
      return;
    }
    if (repos.some((r) => r.name === draft.name)) {
      setError(`repo '${draft.name}' already exists`);
      return;
    }
    setRepos([...repos, draft]);
    setDraft({ name: "", path: "", type: "github", defaultBranch: "main" });
    setAdding(false);
    setError(undefined);
  };

  const onRemove = (name: string) => {
    setRepos(repos.filter((r) => r.name !== name));
  };

  const onSave = () => {
    setError(undefined);
    setSavedMsg(undefined);
    startTransition(async () => {
      const res = await saveRepos(repos);
      if (!res.ok) {
        setError(res.error ?? "save failed");
        return;
      }
      setSavedMsg(`saved ${repos.length} repo${repos.length === 1 ? "" : "s"}`);
      router.refresh();
    });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
        <div>
          <CardTitle>Repositories</CardTitle>
          <CardDescription>
            Repos pwagent operates on. Written to <code className="rounded bg-muted px-1.5 py-0.5">~/.pwagent/config.json</code> →{" "}
            <code>repos[]</code>.
          </CardDescription>
        </div>
        {!adding && (
          <Button size="sm" variant="outline" onClick={() => setAdding(true)} className="gap-1">
            <Plus className="h-3.5 w-3.5" /> Add repo
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {repos.length === 0 && !adding && (
          <p className="text-sm text-muted-foreground">No repos configured. Click "Add repo" to add one.</p>
        )}

        {repos.map((r) => (
          <div
            key={r.name}
            className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2"
          >
            <div className="min-w-0 flex-1">
              <p className="font-mono text-sm font-medium">{r.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                <code>{r.path}</code> · {r.type} · {r.defaultBranch}
              </p>
            </div>
            <Button size="icon" variant="ghost" onClick={() => onRemove(r.name)} aria-label={`remove ${r.name}`}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        ))}

        {adding && (
          <div className="space-y-3 rounded-md border border-dashed border-border bg-muted/30 p-3">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Field label="name">
                <input
                  className={inputClass}
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  placeholder="my-repo"
                />
              </Field>
              <Field label="path (local checkout)">
                <input
                  className={inputClass}
                  value={draft.path}
                  onChange={(e) => setDraft({ ...draft, path: e.target.value })}
                  placeholder="D:/code/my-repo"
                />
              </Field>
              <Field label="type">
                <select
                  className={inputClass}
                  value={draft.type}
                  onChange={(e) => setDraft({ ...draft, type: e.target.value as "ado" | "github" })}
                >
                  <option value="github">github</option>
                  <option value="ado">ado</option>
                </select>
              </Field>
              <Field label="default branch">
                <input
                  className={inputClass}
                  value={draft.defaultBranch}
                  onChange={(e) => setDraft({ ...draft, defaultBranch: e.target.value })}
                  placeholder="main"
                />
              </Field>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={onAdd}>
                Add to list
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {error && (
          <p className="rounded-md bg-red-100 px-3 py-2 text-xs text-red-700 dark:bg-red-900/30 dark:text-red-300">
            {error}
          </p>
        )}
        {savedMsg && <p className="text-xs text-green-600">{savedMsg}</p>}

        <div className="flex items-center gap-2 pt-2">
          <Button size="sm" onClick={onSave} disabled={pending || !dirty} className="gap-1">
            <Save className="h-3.5 w-3.5" />
            {pending ? "Saving…" : "Save repos to config.json"}
          </Button>
          {dirty && <span className="text-xs text-muted-foreground">unsaved changes</span>}
        </div>
      </CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

const inputClass =
  "block w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring";
