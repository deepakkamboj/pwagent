import { Command } from "commander";
import { copyFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { c, glyph, HR } from "../utils/colors.js";
import { ensureDir, fileExists, readJson } from "../utils/files.js";
import { schedulerPaths } from "../scheduler/paths.js";
import { JobSpecSchema, type JobSpec } from "../scheduler/spec.js";
import { loadAllJobs } from "../scheduler/jobLoader.js";
import { describeSchedule, formatDuration } from "../scheduler/scheduleCompute.js";
import { ensureJobState, loadState, saveState } from "../scheduler/state.js";
import { acquireProcessLock, readProcessLockPid, releaseProcessLock } from "../scheduler/lock.js";
import { startLoop } from "../scheduler/loop.js";
import { readLastEvents } from "../scheduler/events.js";
import { dispatch } from "../scheduler/dispatcher.js";

export const schedulerCommand = new Command("scheduler").description("Manage the in-process scheduler");

schedulerCommand
  .command("start")
  .description("Start the scheduler tick loop in this process")
  .option("--daemon", "detach via a platform-specific service (not yet wired)")
  .action(async (opts: { daemon?: boolean }) => {
    if (opts.daemon) {
      console.log(c.warn("--daemon detach not yet wired in v0.1 — run without --daemon for now"));
    }
    const ok = await acquireProcessLock();
    if (!ok) {
      const pid = readProcessLockPid();
      console.error(c.err(`scheduler already running (pid ${pid ?? "unknown"})`));
      process.exitCode = 1;
      return;
    }
    await ensureDir(schedulerPaths.dir);
    await ensureDir(schedulerPaths.logs);
    await ensureDir(schedulerPaths.events);
    await ensureDir(schedulerPaths.locks);

    console.log(c.bold("pwagent scheduler — running. Ctrl+C to stop."));
    console.log(c.dim(`  state: ${schedulerPaths.state}`));
    console.log(c.dim(`  logs:  ${schedulerPaths.logs}`));
    console.log();

    const handle = await startLoop();

    const shutdown = async () => {
      console.log();
      console.log(c.dim("shutting down…"));
      await handle.stop();
      releaseProcessLock();
      process.exit(0);
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  });

schedulerCommand
  .command("stop")
  .description("Signal a running scheduler to stop (sends SIGTERM to the PID in pwagent-scheduler.pid)")
  .action(() => {
    const pid = readProcessLockPid();
    if (!pid) {
      console.log(c.dim("no scheduler PID file — already stopped"));
      return;
    }
    try {
      process.kill(pid, "SIGTERM");
      console.log(c.ok(`✓ sent SIGTERM to pid ${pid}`));
    } catch {
      console.log(c.warn("pid file is stale — cleaning up"));
      releaseProcessLock();
    }
  });

schedulerCommand
  .command("list")
  .description("Show enabled jobs + next fire time")
  .action(async () => {
    const jobs = await loadAllJobs();
    const state = await loadState();
    if (jobs.size === 0) {
      console.log(c.warn("no jobs configured"));
      return;
    }
    console.log(HR);
    console.log(
      `  ${c.bold("ID".padEnd(28))} ${c.bold("SCHEDULE".padEnd(20))} ${c.bold("NEXT".padEnd(14))} ${c.bold("STATE")}`,
    );
    console.log(HR);
    const now = Date.now();
    for (const { spec, source } of [...jobs.values()].sort((a, b) => a.spec.id.localeCompare(b.spec.id))) {
      const st = state.jobs[spec.id];
      const nextMs = st?.nextDueAt ? new Date(st.nextDueAt).getTime() : undefined;
      const nextStr = nextMs !== undefined ? `in ${formatDuration(nextMs - now)}` : "—";
      const stateStr = !spec.enabled
        ? c.dim("disabled")
        : st?.autoDisabled
          ? c.err("auto-disabled")
          : c.ok("enabled");
      const src = source === "config" ? c.cyan("(config)") : c.dim(`(${source})`);
      console.log(`  ${spec.id.padEnd(28)} ${describeSchedule(spec.schedule).padEnd(20)} ${nextStr.padEnd(14)} ${stateStr} ${src}`);
    }
    console.log(HR);
    const enabled = [...jobs.values()].filter((j) => j.spec.enabled).length;
    const auto = Object.values(state.jobs).filter((s) => s.autoDisabled).length;
    console.log(c.dim(`  ${enabled} enabled · ${jobs.size - enabled} disabled · ${auto} auto-disabled`));
  });

schedulerCommand
  .command("status [id]")
  .description("Show last N runs for a job (or summary across all jobs)")
  .option("-n, --limit <n>", "events to show per job", "10")
  .action(async (id: string | undefined, opts: { limit: string }) => {
    const limit = Math.max(1, Math.min(100, parseInt(opts.limit, 10) || 10));
    const jobs = await loadAllJobs();
    const state = await loadState();
    const pid = readProcessLockPid();
    console.log(HR);
    console.log(`  scheduler:  ${pid ? c.ok(`running (pid ${pid})`) : c.dim("not running")}`);
    console.log(HR);
    const targets = id ? (jobs.has(id) ? [jobs.get(id)!] : []) : [...jobs.values()];
    if (targets.length === 0) {
      console.error(c.err(`no such job: ${id}`));
      process.exitCode = 1;
      return;
    }
    for (const { spec } of targets) {
      const st = state.jobs[spec.id];
      const consecutive = st?.consecutiveFailures ?? 0;
      console.log();
      console.log(c.bold(`  ${spec.id}`));
      console.log(`    schedule:           ${describeSchedule(spec.schedule)}`);
      console.log(`    enabled:            ${spec.enabled ? "yes" : "no"}`);
      console.log(`    auto-disabled:      ${st?.autoDisabled ? "yes" : "no"}`);
      console.log(`    last exit code:     ${st?.lastExitCode ?? "—"}`);
      console.log(`    consecutive fails:  ${consecutive}`);
      console.log(`    last run:           ${st?.lastRunAt ?? "—"}`);
      console.log(`    next due:           ${st?.nextDueAt ?? "—"}`);
      const events = readLastEvents(spec.id, limit);
      if (events.length > 0) {
        console.log(`    events (last ${events.length}):`);
        for (const e of events) {
          const icon = e.type === "agent_end" ? glyph.ok : e.type === "agent_error" ? glyph.err : glyph.pending;
          console.log(`      ${icon} ${e.timestamp} ${e.type}`);
        }
      }
    }
    console.log(HR);
  });

schedulerCommand
  .command("dry-run <id>")
  .description("Show what would run for a job; with --execute, fire it once outside the loop")
  .option("--execute", "actually dispatch this once")
  .action(async (id: string, opts: { execute?: boolean }) => {
    const jobs = await loadAllJobs();
    const job = jobs.get(id);
    if (!job) {
      console.error(c.err(`no such job: ${id}`));
      process.exitCode = 1;
      return;
    }
    console.log(HR);
    console.log(c.bold(`  ${job.spec.id}`));
    console.log(`    description:    ${job.spec.description || c.dim("(none)")}`);
    console.log(`    schedule:       ${describeSchedule(job.spec.schedule)}`);
    console.log(`    surface:        ${job.spec.surface}`);
    console.log(`    argv:           ${JSON.stringify(job.spec.argv)}`);
    console.log(`    maxRunSeconds:  ${job.spec.maxRunSeconds}`);
    console.log(HR);
    if (!opts.execute) {
      console.log(c.dim("  add --execute to actually dispatch this job once"));
      return;
    }
    console.log(c.bold("  executing…"));
    const result = await dispatch(job.spec);
    console.log();
    console.log(`  runId:     ${result.runId}`);
    console.log(`  exitCode:  ${result.exitCode}`);
    console.log(`  duration:  ${formatDuration(result.durationMs)}`);
    if (result.timedOut) console.log(c.err("  TIMED OUT"));
  });

export const jobCommand = new Command("job").description("Add / enable / disable / inspect scheduler jobs");

jobCommand
  .command("add <path>")
  .description("Validate a JSON job spec and copy it into ~/.pwagent/scheduler/")
  .action(async (path: string) => {
    if (!fileExists(path)) {
      console.error(c.err(`not found: ${path}`));
      process.exitCode = 1;
      return;
    }
    let parsed: JobSpec;
    try {
      const raw = await readJson(path);
      parsed = JobSpecSchema.parse(raw);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(c.err(`invalid job spec: ${msg.split("\n")[0]}`));
      process.exitCode = 1;
      return;
    }
    await ensureDir(schedulerPaths.dir);
    const dst = join(schedulerPaths.dir, `${parsed.id}.json`);
    await copyFile(path, dst);
    console.log(c.ok(`✓ added ${dst} (${basename(path)})`));
  });

jobCommand
  .command("enable <id>")
  .description("Set enabled=true and clear auto-disabled flag")
  .action(async (id: string) => {
    await toggleJob(id, true);
  });

jobCommand
  .command("disable <id>")
  .description("Set enabled=false")
  .action(async (id: string) => {
    await toggleJob(id, false);
  });

jobCommand
  .command("logs <id>")
  .description("Print the last N events for a job")
  .option("-n, --limit <n>", "events to show", "20")
  .action(async (id: string, opts: { limit: string }) => {
    const limit = Math.max(1, Math.min(500, parseInt(opts.limit, 10) || 20));
    const events = readLastEvents(id, limit);
    if (events.length === 0) {
      console.log(c.dim(`no events recorded for ${id}`));
      return;
    }
    for (const e of events) {
      const icon = e.type === "agent_end" ? glyph.ok : e.type === "agent_error" ? glyph.err : glyph.pending;
      const data = e.data ? c.dim(JSON.stringify(e.data)) : "";
      console.log(`${icon} ${e.timestamp} ${c.bold(e.type)} ${data}`);
    }
  });

async function toggleJob(id: string, enabled: boolean): Promise<void> {
  const jobs = await loadAllJobs();
  const job = jobs.get(id);
  if (!job) {
    console.error(c.err(`no such job: ${id}`));
    process.exitCode = 1;
    return;
  }
  // For user-owned specs we rewrite the file; for embedded specs we materialize
  // an override copy into the user dir.
  await ensureDir(schedulerPaths.dir);
  const userPath = join(schedulerPaths.dir, `${id}.json`);
  const next = { ...job.spec, enabled };
  await import("../utils/files.js").then((m) => m.writeJsonAtomic(userPath, next));

  const state = await loadState();
  const st = ensureJobState(state, id);
  if (enabled) {
    st.autoDisabled = false;
    delete st.autoDisabledAt;
    st.consecutiveFailures = 0;
  }
  await saveState(state);
  console.log(c.ok(`✓ ${id} → ${enabled ? "enabled" : "disabled"}`));
}

