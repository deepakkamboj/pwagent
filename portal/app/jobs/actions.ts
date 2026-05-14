"use server";

import { mkdir, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { portalPaths } from "@/lib/paths";
import { getJob } from "@/lib/jobs";
import { isReadOnly, isWriteAuthorized } from "@/lib/auth";

const execFileAsync = promisify(execFile);

async function requireWriteAuth(): Promise<{ ok: true } | { ok: false; error: string }> {
  if (isReadOnly()) return { ok: false, error: "portal is in --read-only mode" };
  const store = await cookies();
  const cookieToken = store.get("pwagent_session")?.value;
  if (!isWriteAuthorized({ cookieToken, readOnly: false })) {
    return { ok: false, error: "unauthorized — refresh the page to pick up the session cookie" };
  }
  return { ok: true };
}

export async function toggleJob(id: string, enabled: boolean): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireWriteAuth();
  if (!auth.ok) return auth;
  const job = await getJob(id);
  if (!job) return { ok: false, error: `unknown job: ${id}` };

  // Materialize the user override under ~/.pwagent/scheduler/<id>.json
  await mkdir(portalPaths.scheduler, { recursive: true });
  const next = { ...job, enabled };
  // Strip internal fields the spec schema doesn't accept.
  const cleaned = {
    id: next.id,
    description: next.description,
    enabled: next.enabled,
    schedule: next.schedule,
    surface: next.surface,
    argv: next.argv,
  };
  const userPath = join(portalPaths.scheduler, `${id}.json`);
  await writeFile(userPath, JSON.stringify(cleaned, null, 2), "utf8");

  revalidatePath("/jobs");
  revalidatePath(`/jobs/${id}`);
  return { ok: true };
}

export async function fireJob(id: string): Promise<{ ok: boolean; error?: string; output?: string }> {
  const auth = await requireWriteAuth();
  if (!auth.ok) return auth;
  const job = await getJob(id);
  if (!job) return { ok: false, error: `unknown job: ${id}` };

  // Find the pwagent CLI binary. In monorepo dev: ../cli/dist/index.js; production: shell out to `pwagent`.
  const candidates = [join(process.cwd(), "..", "cli", "dist", "index.js"), join(process.cwd(), "..", "dist", "index.js"), "pwagent"];
  let cmd: string | undefined;
  let args: string[] = [];
  for (const c of candidates) {
    if (c === "pwagent") {
      cmd = "pwagent";
      args = ["scheduler", "dry-run", id, "--execute"];
      break;
    }
    if (existsSync(c)) {
      cmd = "node";
      args = [c, "scheduler", "dry-run", id, "--execute"];
      break;
    }
  }
  if (!cmd) return { ok: false, error: "could not locate pwagent CLI" };

  try {
    const { stdout, stderr } = await execFileAsync(cmd, args, { timeout: 600_000 });
    revalidatePath(`/jobs/${id}`);
    return { ok: true, output: (stdout + "\n" + stderr).slice(-2000) };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg.split("\n")[0] };
  }
}

export async function readConfig(): Promise<unknown> {
  if (!existsSync(portalPaths.config)) return null;
  try {
    return JSON.parse(readFileSync(portalPaths.config, "utf8"));
  } catch {
    return null;
  }
}

// ── createJob ────────────────────────────────────────────────────────────

export interface CreateJobInput {
  id: string;
  description?: string;
  enabled: boolean;
  scheduleType: "interval" | "daily" | "weekly" | "cron";
  intervalMinutes?: number;
  time?: string;
  weekday?: string;
  cron?: string;
  argv: string[];
}

const KEBAB_RE = /^[a-z][a-z0-9-]*$/;
const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const WEEKDAYS = new Set([
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
]);

function validateCreateJobInput(input: CreateJobInput): string | undefined {
  if (!KEBAB_RE.test(input.id)) return "id must be lowercase-kebab (e.g. my-job)";
  if (!Array.isArray(input.argv) || input.argv.length === 0) return "argv must have at least one token";
  switch (input.scheduleType) {
    case "interval":
      if (!input.intervalMinutes || input.intervalMinutes < 1) return "interval requires a positive intervalMinutes";
      break;
    case "daily":
      if (!input.time || !HHMM_RE.test(input.time)) return "daily requires time in HH:MM";
      break;
    case "weekly":
      if (!input.time || !HHMM_RE.test(input.time)) return "weekly requires time in HH:MM";
      if (!input.weekday || !WEEKDAYS.has(input.weekday)) return "weekly requires a weekday like 'Friday'";
      break;
    case "cron":
      if (!input.cron || input.cron.length === 0) return "cron requires a cron expression";
      break;
  }
  return undefined;
}

export async function createJob(input: CreateJobInput): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireWriteAuth();
  if (!auth.ok) return auth;

  const validationError = validateCreateJobInput(input);
  if (validationError) return { ok: false, error: validationError };

  const existing = await getJob(input.id);
  if (existing) return { ok: false, error: `job '${input.id}' already exists` };

  // Canonical write: append to ~/.pwagent/config.json → schedules[]
  // This matches what the CLI scheduler reads (cli/src/scheduler/jobLoader.ts).
  const cfgRaw = existsSync(portalPaths.config) ? readFileSync(portalPaths.config, "utf8") : "{}";
  let cfg: { schedules?: unknown[] } & Record<string, unknown>;
  try {
    cfg = JSON.parse(cfgRaw) as typeof cfg;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `config.json is not valid JSON: ${msg}` };
  }
  if (!Array.isArray(cfg.schedules)) cfg.schedules = [];

  const entry: Record<string, unknown> = {
    name: input.id,
    kind: input.scheduleType,
    command: input.argv,
    enabled: input.enabled,
    description: input.description ?? "",
  };
  if (input.scheduleType === "interval") entry["interval"] = input.intervalMinutes;
  if (input.scheduleType === "daily") entry["time"] = input.time;
  if (input.scheduleType === "weekly") {
    entry["time"] = input.time;
    entry["weekday"] = input.weekday;
  }
  if (input.scheduleType === "cron") entry["cron"] = input.cron;

  (cfg.schedules as unknown[]).push(entry);

  // Atomic write: tmp + rename.
  const tmpPath = `${portalPaths.config}.tmp`;
  await writeFile(tmpPath, JSON.stringify(cfg, null, 2), "utf8");
  const { rename } = await import("node:fs/promises");
  await rename(tmpPath, portalPaths.config);

  revalidatePath("/jobs");
  return { ok: true };
}
