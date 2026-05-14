import Link from "next/link";
import { readFileSync, existsSync } from "node:fs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listJobs, isSchedulerRunning } from "@/lib/jobs";
import { portalPaths } from "@/lib/paths";
import { SchedulerControls } from "./controls";
import { SchedulerEventTail } from "./eventTail";

export const dynamic = "force-dynamic";

interface SchedulerStateJobs {
  jobs?: Record<
    string,
    {
      lastRunAt?: string;
      nextDueAt?: string;
      lastExitCode?: number;
      consecutiveFailures?: number;
      autoDisabled?: boolean;
    }
  >;
}

function readPid(): number | undefined {
  if (!existsSync(portalPaths.schedulerPid)) return undefined;
  try {
    const data = JSON.parse(readFileSync(portalPaths.schedulerPid, "utf8")) as { pid?: number };
    return data.pid;
  } catch {
    return undefined;
  }
}

function readState(): SchedulerStateJobs {
  if (!existsSync(portalPaths.schedulerState)) return {};
  try {
    return JSON.parse(readFileSync(portalPaths.schedulerState, "utf8")) as SchedulerStateJobs;
  } catch {
    return {};
  }
}

function describeSchedule(s: {
  type: string;
  minutes?: number;
  time?: string;
  weekday?: string;
  cron?: string;
}): string {
  if (s.cron) return `cron ${s.cron}`;
  if (s.type === "interval") return `every ${s.minutes}m`;
  if (s.type === "daily") return `daily @ ${s.time}`;
  if (s.type === "weekly") return `${s.weekday} @ ${s.time}`;
  if (s.type === "startup") return "on startup";
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

export default async function SchedulerPage() {
  const running = isSchedulerRunning();
  const pid = readPid();
  const jobs = await listJobs();
  const state = readState();
  const now = Date.now();

  const enabledCount = jobs.filter((j) => j.enabled).length;
  const autoDisabled = jobs.filter((j) => j.state?.autoDisabled).length;

  const upcoming = [...jobs]
    .filter((j) => j.enabled && j.state?.nextDueAt)
    .map((j) => ({ id: j.id, ms: new Date(j.state!.nextDueAt!).getTime(), label: describeSchedule(j.schedule) }))
    .sort((a, b) => a.ms - b.ms)
    .slice(0, 5);

  const recent = [...jobs]
    .filter((j) => j.state?.lastRunAt)
    .map((j) => ({
      id: j.id,
      ms: new Date(j.state!.lastRunAt!).getTime(),
      exitCode: j.state?.lastExitCode,
      failures: j.state?.consecutiveFailures ?? 0,
    }))
    .sort((a, b) => b.ms - a.ms)
    .slice(0, 5);

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Scheduler</h1>
          <p className="text-sm text-muted-foreground">
            In-process tick loop inside the <code className="rounded bg-muted px-1.5 py-0.5">pwagent</code> binary.{" "}
            Reads <code className="rounded bg-muted px-1.5 py-0.5">~/.pwagent/config.json</code> → <code>schedules[]</code>,
            hot-reloaded on file change.
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">state</p>
          <p
            className={
              running
                ? "font-mono text-sm font-medium text-green-600"
                : "font-mono text-sm font-medium text-muted-foreground"
            }
          >
            {running ? "running" : "stopped"}
            {pid && running ? <span className="ml-2 text-xs text-muted-foreground">pid {pid}</span> : null}
          </p>
        </div>
      </header>

      <SchedulerControls running={running} />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Total jobs" value={jobs.length} />
        <Stat label="Enabled" value={enabledCount} accent={enabledCount > 0 ? "green" : undefined} />
        <Stat label="Auto-disabled" value={autoDisabled} accent={autoDisabled > 0 ? "red" : undefined} />
        <Stat
          label="State file"
          value={Object.keys(state.jobs ?? {}).length}
          hint="jobs with recorded state"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Next 5 fires</CardTitle>
            <CardDescription>Enabled jobs with a recorded nextDueAt.</CardDescription>
          </CardHeader>
          <CardContent>
            {upcoming.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {enabledCount === 0
                  ? "No enabled jobs. Visit /jobs to enable or create one."
                  : "No nextDueAt recorded yet — scheduler hasn't ticked since these were enabled."}
              </p>
            ) : (
              <ul className="space-y-2 text-sm">
                {upcoming.map((u) => (
                  <li key={u.id} className="flex items-center justify-between gap-3">
                    <Link href={`/jobs/${u.id}`} className="font-mono text-xs hover:underline">
                      {u.id}
                    </Link>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>{u.label}</span>
                      <span>in {formatDuration(u.ms - now)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Last 5 runs</CardTitle>
            <CardDescription>Most recent invocations across all jobs.</CardDescription>
          </CardHeader>
          <CardContent>
            {recent.length === 0 ? (
              <p className="text-sm text-muted-foreground">No runs recorded yet.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {recent.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-3">
                    <Link href={`/jobs/${r.id}`} className="font-mono text-xs hover:underline">
                      {r.id}
                    </Link>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>{formatDuration(now - r.ms)} ago</span>
                      <span
                        className={
                          r.exitCode === 0
                            ? "rounded bg-green-100 px-1.5 py-0.5 text-green-700 dark:bg-green-900/40 dark:text-green-300"
                            : r.exitCode !== undefined
                              ? "rounded bg-red-100 px-1.5 py-0.5 text-red-700 dark:bg-red-900/40 dark:text-red-300"
                              : ""
                        }
                      >
                        {r.exitCode === 0 ? "ok" : r.exitCode !== undefined ? `exit ${r.exitCode}` : "—"}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Live event tail</CardTitle>
          <CardDescription>
            Combined SSE feed from <code className="rounded bg-muted px-1.5 py-0.5">~/.pwagent/scheduler/events/*.jsonl</code>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SchedulerEventTail />
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Detailed per-job view at{" "}
        <Link href="/jobs" className="underline">
          /jobs
        </Link>
        . Full reference at{" "}
        <a
          href="http://127.0.0.1:7338/scheduler"
          target="_blank"
          rel="noreferrer"
          className="underline"
        >
          docs → Scheduler
        </a>
        .
      </p>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: number;
  hint?: string;
  accent?: "green" | "red";
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p
          className={
            accent === "green"
              ? "text-2xl font-semibold text-green-600"
              : accent === "red"
                ? "text-2xl font-semibold text-red-600"
                : "text-2xl font-semibold"
          }
        >
          {value}
        </p>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}
