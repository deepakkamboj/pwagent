import { existsSync, readFileSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { portalPaths } from "./paths";

export interface JobRecord {
  id: string;
  description: string;
  enabled: boolean;
  surface: string;
  argv: string[];
  schedule: { type: string; minutes?: number; time?: string; weekday?: string; cron?: string };
  source: "embedded" | "user" | "config";
  state?: {
    lastRunAt?: string;
    nextDueAt?: string;
    lastExitCode?: number;
    consecutiveFailures: number;
    autoDisabled?: boolean;
  };
}

interface ScheduleEntry {
  name: string;
  kind: "startup" | "interval" | "daily" | "weekly" | "cron";
  interval?: number;
  time?: string;
  weekday?: string;
  cron?: string;
  command: string | string[];
  enabled?: boolean;
  description?: string;
}

interface ConfigShape {
  schedules?: ScheduleEntry[];
}

function readConfigSchedules(): JobRecord[] {
  if (!existsSync(portalPaths.config)) return [];
  let cfg: ConfigShape;
  try {
    cfg = JSON.parse(readFileSync(portalPaths.config, "utf8")) as ConfigShape;
  } catch {
    return [];
  }
  const out: JobRecord[] = [];
  for (const entry of cfg.schedules ?? []) {
    try {
      out.push(entryToJobRecord(entry));
    } catch {
      /* skip malformed entry */
    }
  }
  return out;
}

function entryToJobRecord(entry: ScheduleEntry): JobRecord {
  const isWin = process.platform === "win32";
  const argv = Array.isArray(entry.command)
    ? entry.command
    : isWin
      ? ["pwsh", "-NoProfile", "-Command", entry.command]
      : ["sh", "-c", entry.command];

  let schedule: JobRecord["schedule"];
  switch (entry.kind) {
    case "interval":
      schedule = { type: "interval", minutes: entry.interval };
      break;
    case "daily":
      schedule = { type: "daily", time: entry.time };
      break;
    case "weekly":
      schedule = { type: "weekly", time: entry.time, weekday: entry.weekday };
      break;
    case "cron":
      schedule = { type: "cron", cron: entry.cron };
      break;
    case "startup":
      schedule = { type: "startup" };
      break;
  }

  return {
    id: entry.name,
    description: entry.description ?? "",
    enabled: entry.enabled ?? true,
    surface: Array.isArray(entry.command) ? "external" : "external",
    argv,
    schedule,
    source: "config",
  };
}

interface StateFile {
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

function readState(): StateFile {
  if (!existsSync(portalPaths.schedulerState)) return {};
  try {
    return JSON.parse(readFileSync(portalPaths.schedulerState, "utf8")) as StateFile;
  } catch {
    return {};
  }
}

export async function listJobs(): Promise<JobRecord[]> {
  const state = readState();
  const out = new Map<string, JobRecord>();

  // 1. Canonical source: schedules declared in ~/.pwagent/config.json
  for (const j of readConfigSchedules()) out.set(j.id, j);

  // 2. Per-file user overrides at ~/.pwagent/scheduler/<id>.json — these
  //    replace config-defined entries (e.g. after toggleJob materializes one).
  if (existsSync(portalPaths.scheduler)) {
    for (const j of await readJobsFrom(portalPaths.scheduler, "user")) {
      out.set(j.id, j);
    }
  }

  for (const j of out.values()) {
    const s = state.jobs?.[j.id];
    if (s) {
      j.state = {
        lastRunAt: s.lastRunAt,
        nextDueAt: s.nextDueAt,
        lastExitCode: s.lastExitCode,
        consecutiveFailures: s.consecutiveFailures ?? 0,
        autoDisabled: s.autoDisabled,
      };
    }
  }
  return Array.from(out.values()).sort((a, b) => a.id.localeCompare(b.id));
}

async function readJobsFrom(dir: string, source: "user"): Promise<JobRecord[]> {
  const out: JobRecord[] = [];
  let entries: string[] = [];
  try {
    entries = await readdir(dir);
  } catch {
    return out;
  }
  for (const f of entries) {
    if (!f.endsWith(".json")) continue;
    try {
      const raw = await readFile(join(dir, f), "utf8");
      const spec = JSON.parse(raw) as Omit<JobRecord, "source" | "state">;
      out.push({ ...spec, source });
    } catch {
      /* skip */
    }
  }
  return out;
}

export async function getJob(id: string): Promise<JobRecord | undefined> {
  const all = await listJobs();
  return all.find((j) => j.id === id);
}

export function isSchedulerRunning(): boolean {
  if (!existsSync(portalPaths.schedulerPid)) return false;
  try {
    const data = JSON.parse(readFileSync(portalPaths.schedulerPid, "utf8")) as { pid: number };
    process.kill(data.pid, 0);
    return true;
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (code === "EPERM") return true;
    return false;
  }
}
