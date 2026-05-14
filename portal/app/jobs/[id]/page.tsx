import { notFound } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getJob } from "@/lib/jobs";
import { EventStream } from "./eventStream";

export const dynamic = "force-dynamic";

export default async function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = await getJob(id);
  if (!job) notFound();

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs text-muted-foreground">
          <Link href="/jobs" className="hover:underline">
            ← all jobs
          </Link>
        </p>
        <h1 className="text-2xl font-semibold tracking-tight font-mono">{job.id}</h1>
        <p className="text-sm text-muted-foreground">{job.description || "(no description)"}</p>
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Spec</CardTitle>
            <CardDescription>How and when this job runs.</CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="overflow-x-auto rounded-md bg-muted px-3 py-3 text-xs leading-relaxed">
              {JSON.stringify(
                {
                  enabled: job.enabled,
                  schedule: job.schedule,
                  surface: job.surface,
                  argv: job.argv,
                },
                null,
                2,
              )}
            </pre>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>State</CardTitle>
            <CardDescription>Last observed run state.</CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="overflow-x-auto rounded-md bg-muted px-3 py-3 text-xs leading-relaxed">
              {JSON.stringify(job.state ?? { note: "no state recorded yet" }, null, 2)}
            </pre>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Live event tail</CardTitle>
          <CardDescription>
            Streamed via SSE from <code className="rounded bg-muted px-1.5 py-0.5">~/.pwagent/scheduler/events/{job.id}.jsonl</code>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EventStream jobId={job.id} />
        </CardContent>
      </Card>
    </div>
  );
}
