import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { readAuditEvents, distinctAgents, distinctTypes } from "@/lib/audit";
import { AuditFilterBar } from "./filterBar";

export const dynamic = "force-dynamic";

interface SearchParams {
  since?: string;
  type?: string;
  agent?: string;
  search?: string;
}

export default async function AuditPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const filter = {
    since: sp.since ?? "7d",
    type: sp.type,
    agent: sp.agent,
    search: sp.search,
  };
  // Read once for type/agent dropdowns (no filter — so the dropdowns always show the
  // full set), and again with filters applied for the displayed list.
  const allEvents = readAuditEvents({ since: "365d" });
  const filteredEvents = readAuditEvents(filter);

  const types = distinctTypes(allEvents);
  const agents = distinctAgents(allEvents);

  const exportUrl = new URL("/api/audit/export", "http://placeholder");
  if (filter.since) exportUrl.searchParams.set("since", filter.since);
  if (filter.type) exportUrl.searchParams.set("type", filter.type);
  if (filter.agent) exportUrl.searchParams.set("agent", filter.agent);
  if (filter.search) exportUrl.searchParams.set("search", filter.search);

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Audit log</h1>
          <p className="text-sm text-muted-foreground">
            Every dispatch, tool call, and model invocation. JSONL stream at{" "}
            <code className="rounded bg-muted px-1.5 py-0.5">~/.pwagent/audit/events.jsonl</code>.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <a href={`/api/audit/export${exportUrl.search}&format=jsonl`}>
              <Download className="h-4 w-4" />
              .jsonl
            </a>
          </Button>
          <Button asChild variant="outline" size="sm">
            <a href={`/api/audit/export${exportUrl.search}&format=json`}>
              <Download className="h-4 w-4" />
              .json
            </a>
          </Button>
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Filter</CardTitle>
          <CardDescription>Filters apply server-side; the URL is shareable.</CardDescription>
        </CardHeader>
        <CardContent>
          <AuditFilterBar
            initial={filter}
            types={types}
            agents={agents}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{filteredEvents.length} event{filteredEvents.length === 1 ? "" : "s"}</CardTitle>
          <CardDescription>Newest first. Bounded at 50,000 results.</CardDescription>
        </CardHeader>
        <CardContent>
          {filteredEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground">No events match the current filter.</p>
          ) : (
            <div className="space-y-1 font-mono text-xs">
              {filteredEvents.map((e, i) => (
                <div key={i} className="flex flex-wrap gap-2 border-b border-border/40 py-1.5 last:border-0">
                  <span className="shrink-0 text-muted-foreground">{e.timestamp}</span>
                  <span className={typeStyle(e.type)}>{e.type}</span>
                  {e.agent && <span className="text-blue-600">{e.agent}</span>}
                  {e.runId && <span className="text-muted-foreground">{e.runId}</span>}
                  {e.data && (
                    <span className="ml-auto truncate text-muted-foreground" title={JSON.stringify(e.data)}>
                      {JSON.stringify(e.data).slice(0, 200)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function typeStyle(type: string): string {
  if (type === "run.complete") return "font-medium text-green-600";
  if (type === "run.error" || type === "tool.error") return "font-medium text-red-600";
  if (type === "run.start" || type === "tool.invoke") return "text-foreground";
  if (type === "review.stamp") return "text-purple-600";
  if (type.startsWith("scheduler.")) return "text-amber-600";
  return "text-muted-foreground";
}
