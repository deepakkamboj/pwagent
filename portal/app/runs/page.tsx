import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function RunsPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Runs</h1>
        <p className="text-sm text-muted-foreground">
          Every agent invocation across CLI / Chat / scheduler / portal triggers.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>No runs yet</CardTitle>
          <CardDescription>Trigger one from the terminal: <code>pwagent run triage --run-id 12345</code></CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Each run will appear here with charter, model, duration, tool calls, and a link to its full transcript.
        </CardContent>
      </Card>
    </div>
  );
}
