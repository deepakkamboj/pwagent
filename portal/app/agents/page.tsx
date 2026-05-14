import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listEmbeddedCharters } from "@/lib/charters";

export const dynamic = "force-dynamic";

export default async function AgentsPage() {
  const charters = await listEmbeddedCharters();
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Agents</h1>
        <p className="text-sm text-muted-foreground">
          {charters.length} embedded charter{charters.length === 1 ? "" : "s"}. Workspace overrides at{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">{`<cwd>/.squad/agents/<name>/charter.md`}</code> win over embedded.
        </p>
      </header>

      {charters.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No charters found. Make sure the pwagent CLI is built (<code>npm run build</code> in the sibling{" "}
            <code>pwagent/</code> dir).
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {charters.map((c) => (
            <Card key={c.name} className="transition-shadow hover:shadow-md">
              <CardHeader>
                <CardTitle className="font-mono text-sm">{c.name}</CardTitle>
                <CardDescription>{c.source}</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground line-clamp-3">{c.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
