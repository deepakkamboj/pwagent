"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";

interface Props {
  initial: { since?: string; type?: string; agent?: string; search?: string };
  types: string[];
  agents: string[];
}

const SINCE_OPTIONS = [
  { value: "1h", label: "Last 1 hour" },
  { value: "24h", label: "Last 24 hours" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "365d", label: "Last 365 days" },
];

export function AuditFilterBar({ initial, types, agents }: Props) {
  const router = useRouter();
  const sp = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState({
    since: initial.since ?? "7d",
    type: initial.type ?? "",
    agent: initial.agent ?? "",
    search: initial.search ?? "",
  });

  const apply = () => {
    const next = new URLSearchParams(sp.toString());
    next.set("since", draft.since);
    if (draft.type) next.set("type", draft.type); else next.delete("type");
    if (draft.agent) next.set("agent", draft.agent); else next.delete("agent");
    if (draft.search) next.set("search", draft.search); else next.delete("search");
    startTransition(() => router.push(`/audit?${next.toString()}`));
  };

  const reset = () => {
    setDraft({ since: "7d", type: "", agent: "", search: "" });
    startTransition(() => router.push("/audit"));
  };

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-5">
      <label className="space-y-1 text-xs">
        <span className="text-muted-foreground">Time range</span>
        <select
          className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
          value={draft.since}
          onChange={(e) => setDraft({ ...draft, since: e.target.value })}
        >
          {SINCE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </label>

      <label className="space-y-1 text-xs">
        <span className="text-muted-foreground">Event type</span>
        <select
          className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
          value={draft.type}
          onChange={(e) => setDraft({ ...draft, type: e.target.value })}
        >
          <option value="">(any)</option>
          {types.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </label>

      <label className="space-y-1 text-xs">
        <span className="text-muted-foreground">Agent</span>
        <select
          className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
          value={draft.agent}
          onChange={(e) => setDraft({ ...draft, agent: e.target.value })}
        >
          <option value="">(any)</option>
          {agents.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
      </label>

      <label className="space-y-1 text-xs">
        <span className="text-muted-foreground">Free-text</span>
        <input
          type="text"
          className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
          placeholder="contains…"
          value={draft.search}
          onChange={(e) => setDraft({ ...draft, search: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === "Enter") apply();
          }}
        />
      </label>

      <div className="flex items-end gap-2">
        <Button size="sm" onClick={apply} disabled={pending}>
          Apply
        </Button>
        <Button size="sm" variant="ghost" onClick={reset} disabled={pending}>
          Reset
        </Button>
      </div>
    </div>
  );
}
