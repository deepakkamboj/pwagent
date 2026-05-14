import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { readConfig } from "@/lib/config";
import { ConfigEditor } from "./editor";
import { ReposEditor } from "./reposEditor";

export const dynamic = "force-dynamic";

export default async function ConfigPage() {
  const cfg = readConfig();

  if (!cfg) {
    return (
      <div className="space-y-6">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">Config</h1>
        </header>
        <Card>
          <CardHeader>
            <CardTitle>No config yet</CardTitle>
            <CardDescription>
              Run <code className="rounded bg-muted px-1.5 py-0.5">pwagent init --yes</code> in your terminal first.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Config</h1>
        <p className="text-sm text-muted-foreground">
          Live view of <code className="rounded bg-muted px-1.5 py-0.5">~/.pwagent/config.json</code>. Edits go through a
          diff-preview step before saving.
        </p>
      </header>

      <ConfigEditor initial={cfg} />

      <ReposEditor initial={cfg.repos ?? []} />
    </div>
  );
}
