import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { jobEventsPath, schedulerPaths } from "./paths.js";

/** Mirrors the lifecycle vocabulary from the upstream copilot_multi_agent_platform's AGENTS.md. */
export type EventType =
  | "agent_start"
  | "task_start"
  | "task_end"
  | "validation_start"
  | "validation_end"
  | "retry"
  | "agent_error"
  | "agent_end"
  | "skipped"
  | "timeout"
  | "auto_disabled";

export interface LifecycleEvent {
  type: EventType;
  jobId: string;
  runId: string;
  timestamp: string;
  /** Free-form per-event payload. Keys vary by event type but always JSON-serializable. */
  data?: Record<string, unknown>;
}

let dirReady = false;

async function ensureEventDir(): Promise<void> {
  if (dirReady) return;
  await mkdir(schedulerPaths.events, { recursive: true });
  dirReady = true;
}

export function emit(event: LifecycleEvent): void {
  // Caller does NOT need to await; we synchronously append a single line which is O(latency)
  // but small. The fsync semantics here are deliberately loose — losing the most recent
  // line on a crash is acceptable; we never replay events.
  const path = jobEventsPath(event.jobId);
  try {
    appendFileSync(path, JSON.stringify(event) + "\n", "utf8");
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (code === "ENOENT") {
      // dir didn't exist — create and retry once
      void ensureEventDir().then(() => {
        try {
          appendFileSync(path, JSON.stringify(event) + "\n", "utf8");
        } catch {
          /* swallow — events are best-effort */
        }
      });
    }
  }
}

export function newRunId(): string {
  return `run_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

/** Read the last N events for a job from its JSONL log. Used by `pwagent scheduler status`. */
export function readLastEvents(jobId: string, limit = 10): LifecycleEvent[] {
  const path = jobEventsPath(jobId);
  if (!existsSync(path)) return [];
  try {
    const raw = readFileSync(path, "utf8");
    const lines = raw
      .split("\n")
      .filter((l) => l.trim().length > 0)
      .slice(-limit);
    const out: LifecycleEvent[] = [];
    for (const l of lines) {
      try {
        out.push(JSON.parse(l) as LifecycleEvent);
      } catch {
        /* skip malformed line */
      }
    }
    return out;
  } catch {
    return [];
  }
}

export function ensureEventsDirSync(): void {
  if (existsSync(schedulerPaths.events)) return;
  // ensureDir from utils is async; for the rare cold-path we accept a sync mkdir
  void mkdir(schedulerPaths.events, { recursive: true });
}

// Initialize event-dir best-effort on module load.
void ensureEventDir();

// Hook caller — explicit overload used by dirname() callers to ensure dir exists.
void dirname;
