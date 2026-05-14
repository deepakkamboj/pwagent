import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listJobs, isSchedulerRunning } from "@/lib/jobs";
import { JobRow } from "./row";
import { NewJobForm } from "./newJobForm";

export const dynamic = "force-dynamic";

function describeSchedule(s: { type: string; minutes?: number; time?: string; weekday?: string; cron?: string }): string {
  if (s.cron) return `cron ${s.cron}`;
  if (s.type === "interval") return `interval ${s.minutes}m`;
  if (s.type === "daily") return `daily ${s.time}`;
  if (s.type === "weekly") return `weekly ${s.weekday} ${s.time}`;
  return s.type;
}

function formatDuration(ms: number): string {
  if (ms < 0) ms = 0;
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

export default async function JobsPage() {
  const jobs = await listJobs();
  const running = isSchedulerRunning();
  const now = Date.now();

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Scheduler jobs</h1>
          <p className="text-sm text-muted-foreground">
            Recurring work definitions in <code className="rounded bg-muted px-1.5 py-0.5">~/.pwagent/scheduler/*.json</code>.
            Hot-reloaded on file change.
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">scheduler</p>
          <p className={running ? "font-medium text-green-600" : "font-medium text-muted-foreground"}>
            {running ? "running" : "stopped"}
          </p>
        </div>
      </header>

      <NewJobForm />

      <Card>
        <CardHeader>
          <CardTitle>{jobs.length} job{jobs.length === 1 ? "" : "s"}</CardTitle>
          <CardDescription>Toggle enabled, fire now, drill into a job's recent events. Canonical source: <code className="rounded bg-muted px-1.5 py-0.5">~/.pwagent/config.json</code> → <code>schedules[]</code>.</CardDescription>
        </CardHeader>
        <CardContent>
          {jobs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No jobs configured yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="px-2 py-2 font-medium">ID</th>
                    <th className="px-2 py-2 font-medium">Schedule</th>
                    <th className="px-2 py-2 font-medium">Surface</th>
                    <th className="px-2 py-2 font-medium">Next fire</th>
                    <th className="px-2 py-2 font-medium">Last</th>
                    <th className="px-2 py-2 font-medium">State</th>
                    <th className="px-2 py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((j) => {
                    const nextMs = j.state?.nextDueAt ? new Date(j.state.nextDueAt).getTime() : undefined;
                    return (
                      <JobRow
                        key={j.id}
                        id={j.id}
                        scheduleLabel={describeSchedule(j.schedule)}
                        surface={j.surface}
                        nextFireLabel={nextMs !== undefined ? `in ${formatDuration(nextMs - now)}` : "—"}
                        lastStatus={j.state?.lastExitCode === undefined ? "—" : j.state.lastExitCode === 0 ? "ok" : `exit ${j.state.lastExitCode}`}
                        enabled={j.enabled}
                        autoDisabled={j.state?.autoDisabled === true}
                      />
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        <Link href="/jobs/pwagent-monitor" className="hover:underline">
          Drill into a job →
        </Link>
      </p>
    </div>
  );
}
