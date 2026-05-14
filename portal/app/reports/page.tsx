import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function ReportsPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
        <p className="text-sm text-muted-foreground">
          Weekly digests and ad-hoc reports rendered by the <code className="rounded bg-muted px-1.5 py-0.5">report</code> agent.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>No reports yet</CardTitle>
          <CardDescription>Reports appear in <code>~/.pwagent/reports/</code> after the report agent runs.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Generate one with <code className="rounded bg-muted px-1.5 py-0.5">pwagent run report --period weekly</code>{" "}
          (lands in R1b — agent runtime).
        </CardContent>
      </Card>
    </div>
  );
}
