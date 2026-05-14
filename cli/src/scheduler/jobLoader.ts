import { loadConfig, configExists } from "../config/loader.js";
import { paths } from "../utils/paths.js";
import { JobSpecSchema, type JobSpec, type Schedule } from "./spec.js";
import type { ScheduleEntry } from "../config/schema.js";

export interface LoadedJob {
  spec: JobSpec;
  source: "config";
}

/**
 * Build the in-memory job table from `pwagent.config.json` → `schedules[]`.
 *
 * The user-facing shape lives in `ScheduleEntry` (see config/schema.ts); we
 * map it here into the lower-level `JobSpec` used by the scheduler tick loop.
 * Returns an empty map when no config exists or schedules is empty.
 */
export async function loadAllJobs(): Promise<Map<string, LoadedJob>> {
  const out = new Map<string, LoadedJob>();
  if (!(await configExists())) return out;
  const cfg = await loadConfig();
  for (const entry of cfg.schedules ?? []) {
    try {
      const spec = entryToJobSpec(entry);
      out.set(spec.id, { spec, source: "config" });
    } catch (err: unknown) {
      if (process.env["PWAGENT_DEBUG"]) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[scheduler] skipping schedule '${entry.name}': ${msg}`);
      }
    }
  }
  return out;
}

/**
 * Watch the config file for changes. Returns an unsubscribe function. The
 * caller is expected to reload jobs when this fires. Debounced ~250ms.
 */
export async function watchUserJobs(onChange: () => void): Promise<() => void> {
  const { watch } = await import("node:fs/promises");
  const { existsSync } = await import("node:fs");
  if (!existsSync(paths.config) && !existsSync(paths.home)) return () => {};
  const target = existsSync(paths.config) ? paths.config : paths.home;
  const ac = new AbortController();
  let debounceHandle: NodeJS.Timeout | undefined;
  const trigger = () => {
    if (debounceHandle) clearTimeout(debounceHandle);
    debounceHandle = setTimeout(() => onChange(), 250);
  };

  (async () => {
    try {
      const watcher = watch(target, { signal: ac.signal });
      for await (const _e of watcher) {
        void _e;
        trigger();
      }
    } catch (err: unknown) {
      const name = (err as { name?: string })?.name;
      if (name !== "AbortError") {
        if (process.env["PWAGENT_DEBUG"]) console.error("[scheduler] config watcher error", err);
      }
    }
  })();

  return () => ac.abort();
}

// ── ScheduleEntry → JobSpec ──────────────────────────────────────────────

export function entryToJobSpec(entry: ScheduleEntry): JobSpec {
  const schedule = scheduleForKind(entry);
  const { argv, surface } = parseCommand(entry.command);

  const raw = {
    id: entry.name,
    description: entry.description ?? "",
    enabled: entry.enabled,
    schedule,
    surface,
    argv,
    maxRunSeconds: entry.maxRunSeconds,
    retry: { onExitCodes: [1, 124], maxAttempts: 2, backoffSeconds: 30 },
    disableAfterConsecutiveFailures: 5,
  };
  return JobSpecSchema.parse(raw);
}

function scheduleForKind(entry: ScheduleEntry): Schedule {
  switch (entry.kind) {
    case "startup":
      // Fires once on the first tick, then never again within a typical session.
      // catchUp=false so a missed window during downtime doesn't queue an extra fire.
      return { type: "interval", minutes: 525_600, catchUp: false };
    case "interval":
      return { type: "interval", minutes: entry.interval!, catchUp: entry.catchUp };
    case "daily":
      return { type: "daily", time: entry.time!, catchUp: entry.catchUp };
    case "weekly":
      return { type: "weekly", time: entry.time!, weekday: entry.weekday!, catchUp: entry.catchUp };
    case "cron":
      return { type: "cron", cron: entry.cron!, catchUp: entry.catchUp };
  }
}

/**
 * Parse the `command` field into a (cmd, args[]) pair plus a surface hint.
 *
 *   - Array form: passed verbatim as argv to the dispatcher.
 *   - String form: run through the platform shell so quoting works the way
 *     users expect from a config file. We do NOT split on whitespace — that
 *     would break commands like `gh copilot ask "/triage --run-id 12345"`.
 */
function parseCommand(command: string | string[]): { argv: string[]; surface: "self" | "external" } {
  if (Array.isArray(command)) {
    return { surface: "external", argv: command };
  }
  if (process.platform === "win32") {
    return { surface: "external", argv: ["pwsh", "-NoProfile", "-Command", command] };
  }
  return { surface: "external", argv: ["sh", "-c", command] };
}
