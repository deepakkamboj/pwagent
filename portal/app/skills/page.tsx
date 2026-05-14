import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const PACKS = [
  { id: "core", label: "Core", count: 36, hint: "Locators, assertions, fixtures, auth, mocking, visual, a11y, debugging, …" },
  { id: "ci", label: "CI / CD", count: 6, hint: "Sharding, reporting, coverage, global setup, multi-project config" },
  { id: "pom", label: "Page Object Model", count: 2, hint: "POM patterns and the POM-vs-fixtures debate" },
  { id: "playwright-cli", label: "Playwright CLI", count: 12, hint: "CLI browser automation, codegen, traces, devices" },
  { id: "external", label: "External systems", count: 2, hint: "Kusto (read-only queries), ADO (work items + PRs)" },
];

export default function SkillsPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Skills</h1>
        <p className="text-sm text-muted-foreground">
          Reusable knowledge that the coordinator injects into agent spawn prompts via skill-aware routing.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {PACKS.map((p) => (
          <Card key={p.id}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{p.label}</CardTitle>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{p.count} guides</span>
              </div>
              <CardDescription className="font-mono text-xs">{p.id}/</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">{p.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        Skills currently surface as cards summarising each pack. A skill-by-skill index with full search lands in PT1b.
      </p>
    </div>
  );
}
