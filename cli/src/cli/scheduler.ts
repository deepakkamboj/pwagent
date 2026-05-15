import { Command } from "commander";
import { readFileSync, existsSync } from "node:fs";
import { c, glyph, HR } from "../utils/colors.js";
import {
  startScheduler,
  loadConfig,
  loadState,
  describeCron,
  schedulerHome,
  configFilePath,
  pidPath,
  eventsPath,
} from "@bradygaster/squad-scheduler";
import type { SchedulerJob } from "@bradygaster/squad-scheduler";

function readPid(): number | null {
  const p = pidPath();
  if (!existsSync(p)) return null;
  try {
    const data = JSON.parse(readFileSync(p, "utf8")) as { pid: number };
    return data.pid ?? null;
  } catch {
    return null;
  }
}

function msUntil(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "now";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

function readLastEvents(jobId: string, limit: number): object[] {
  const p = eventsPath(jobId);
  if (!existsSync(p)) return [];
  try {
    const lines = readFileSync(p, "utf8").trim().split("\n").filter(Boolean);
    return lines
      .slice(-limit)
      .map((l) => {
        try { return JSON.parse(l) as object; } catch { return null; }
      })
      .filter(Boolean) as object[];
  } catch {
    return [];
  }
}

export const schedulerCommand = new Command("scheduler").description("Manage the cron scheduler");

schedulerCommand
  .command("start")
  .description("Start the scheduler (reads squad.schedule.json in current directory)")
  .action(async () => {
    const cfgPath = configFilePath(process.cwd());
    if (!existsSync(cfgPath)) {
      console.error(c.err(`no schedule config found: ${cfgPath}`));
      console.log(c.dim("  create squad.schedule.json in your project root to define jobs"));
      process.exitCode = 1;
      return;
    }
    console.log(c.bold("pwagent scheduler — running. Ctrl+C to stop."));
    console.log(c.dim(`  config: ${cfgPath}`));
    console.log(c.dim(`  state:  ${schedulerHome()}`));
    console.log();
    await startScheduler(process.cwd());
  });

schedulerCommand
  .command("stop")
  .description("Send SIGTERM to the running scheduler")
  .action(() => {
    const pid = readPid();
    if (!pid) {
      console.log(c.dim("no scheduler running (no PID file)"));
      return;
    }
    try {
      process.kill(pid, "SIGTERM");
      console.log(c.ok(`✓ sent SIGTERM to pid ${pid}`));
    } catch {
      console.log(c.warn("PID file is stale — already stopped"));
    }
  });

schedulerCommand
  .command("list")
  .description("Show configured jobs and their next fire time")
  .action(() => {
    const cwd = process.cwd();
    let jobs: SchedulerJob[];
    try {
      jobs = loadConfig(cwd);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(c.err(`failed to load schedule: ${msg}`));
      process.exitCode = 1;
      return;
    }
    if (jobs.length === 0) {
      console.log(c.warn("no jobs configured in squad.schedule.json"));
      return;
    }
    const state = loadState();
    const pid = readPid();
    console.log(HR);
    console.log(`  scheduler: ${pid ? c.ok(`running (pid ${pid})`) : c.dim("not running")}`);
    console.log(HR);
    console.log(
      `  ${c.bold("ID".padEnd(28))} ${c.bold("SCHEDULE".padEnd(22))} ${c.bold("NEXT".padEnd(12))} ${c.bold("STATE")}`,
    );
    console.log(HR);
    for (const job of [...jobs].sort((a, b) => a.id.localeCompare(b.id))) {
      const st = state.jobs[job.id];
      const nextStr = st?.nextDueAt ? msUntil(st.nextDueAt) : "—";
      const stateStr =
        job.enabled === false
          ? c.dim("disabled")
          : st?.autoDisabled
            ? c.err("auto-disabled")
            : c.ok("enabled");
      const sched = describeCron(job.cron);
      console.log(`  ${job.id.padEnd(28)} ${sched.padEnd(22)} ${nextStr.padEnd(12)} ${stateStr}`);
    }
    console.log(HR);
    const enabled = jobs.filter((j) => j.enabled !== false).length;
    console.log(c.dim(`  ${enabled} enabled · ${jobs.length - enabled} disabled`));
  });

schedulerCommand
  .command("status [id]")
  .description("Show last runs for a job (or all jobs)")
  .option("-n, --limit <n>", "events to show", "10")
  .action((id: string | undefined, opts: { limit: string }) => {
    const limit = Math.max(1, Math.min(100, parseInt(opts.limit, 10) || 10));
    const cwd = process.cwd();
    let jobs: SchedulerJob[];
    try {
      jobs = loadConfig(cwd);
    } catch {
      jobs = [];
    }
    const state = loadState();
    const pid = readPid();
    console.log(HR);
    console.log(`  scheduler: ${pid ? c.ok(`running (pid ${pid})`) : c.dim("not running")}`);
    console.log(HR);

    const targets = id ? jobs.filter((j) => j.id === id) : jobs;
    if (id && targets.length === 0) {
      console.error(c.err(`no such job: ${id}`));
      process.exitCode = 1;
      return;
    }
    for (const job of targets) {
      const st = state.jobs[job.id];
      console.log();
      console.log(c.bold(`  ${job.id}`));
      console.log(`    schedule:          ${describeCron(job.cron)}`);
      console.log(`    enabled:           ${job.enabled !== false ? "yes" : "no"}`);
      console.log(`    auto-disabled:     ${st?.autoDisabled ? "yes" : "no"}`);
      console.log(`    last exit code:    ${st?.lastExitCode ?? "—"}`);
      console.log(`    consecutive fails: ${st?.consecutiveFailures ?? 0}`);
      console.log(`    last run:          ${st?.lastRunAt ?? "—"}`);
      console.log(`    next due:          ${st?.nextDueAt ? `${st.nextDueAt} (${msUntil(st.nextDueAt)})` : "—"}`);
      const events = readLastEvents(job.id, limit);
      if (events.length > 0) {
        console.log(`    events (last ${events.length}):`);
        for (const e of events as Array<{ ts: string; kind: string }>) {
          const icon = e.kind === "job_end" ? glyph.ok : e.kind?.includes("error") || e.kind?.includes("timeout") ? glyph.err : glyph.pending;
          console.log(`      ${icon} ${e.ts} ${e.kind}`);
        }
      }
    }
    console.log(HR);
  });

schedulerCommand
  .command("logs <id>")
  .description("Print last N events for a job")
  .option("-n, --limit <n>", "events to show", "20")
  .action((id: string, opts: { limit: string }) => {
    const limit = Math.max(1, Math.min(500, parseInt(opts.limit, 10) || 20));
    const events = readLastEvents(id, limit) as Array<{ ts: string; kind: string; [key: string]: unknown }>;
    if (events.length === 0) {
      console.log(c.dim(`no events recorded for ${id}`));
      return;
    }
    for (const e of events) {
      const icon = e.kind === "job_end" ? glyph.ok : e.kind?.includes("error") || e.kind?.includes("timeout") ? glyph.err : glyph.pending;
      const extra = Object.entries(e)
        .filter(([k]) => k !== "ts" && k !== "kind" && k !== "jobId")
        .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
        .join(" ");
      console.log(`${icon} ${e.ts} ${c.bold(e.kind)} ${c.dim(extra)}`);
    }
  });

// jobCommand kept for backwards compat with index.ts import — re-exports as alias
export const jobCommand = schedulerCommand;
