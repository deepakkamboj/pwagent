import { execa } from "execa";
import { mkdir } from "node:fs/promises";
import { appendFileSync, createWriteStream } from "node:fs";
import { dirname } from "node:path";
import { emit, newRunId } from "./events.js";
import { jobLogPath } from "./paths.js";
import type { JobSpec } from "./spec.js";

const PWAGENT_BIN = process.argv[0]; // node
const PWAGENT_ENTRY = process.argv[1] ?? ""; // path to dist/index.js (or src/index.ts in dev)

export interface DispatchResult {
  runId: string;
  exitCode: number;
  durationMs: number;
  timedOut: boolean;
}

/**
 * Run a single job. Spawns either the same pwagent binary (surface=self) or an
 * arbitrary command (surface=external). Captures stdout/stderr to the job log
 * and emits lifecycle events to the JSONL stream.
 */
export async function dispatch(spec: JobSpec): Promise<DispatchResult> {
  const runId = newRunId();
  const started = Date.now();
  emit({ type: "agent_start", jobId: spec.id, runId, timestamp: new Date().toISOString(), data: { spec: spec.id } });

  if (spec.surface === "noop") {
    emit({ type: "agent_end", jobId: spec.id, runId, timestamp: new Date().toISOString(), data: { exitCode: 0, durationMs: Date.now() - started } });
    return { runId, exitCode: 0, durationMs: Date.now() - started, timedOut: false };
  }

  const logPath = jobLogPath(spec.id);
  await mkdir(dirname(logPath), { recursive: true });
  const headerLine = `\n----- ${new Date().toISOString()} run=${runId} -----\n`;
  appendFileSync(logPath, headerLine, "utf8");
  const logStream = createWriteStream(logPath, { flags: "a", encoding: "utf8" });

  let cmd: string;
  let args: string[];
  if (spec.surface === "self") {
    cmd = PWAGENT_BIN;
    args = [PWAGENT_ENTRY, ...spec.argv];
  } else {
    if (spec.argv.length === 0) {
      const msg = "external surface requires non-empty argv";
      logStream.write(msg + "\n");
      logStream.end();
      emit({ type: "agent_error", jobId: spec.id, runId, timestamp: new Date().toISOString(), data: { error: msg } });
      return { runId, exitCode: 2, durationMs: Date.now() - started, timedOut: false };
    }
    cmd = spec.argv[0]!;
    args = spec.argv.slice(1);
  }

  try {
    const child = execa(cmd, args, {
      timeout: spec.maxRunSeconds * 1000,
      reject: false,
      cleanup: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout?.on("data", (chunk: Buffer) => logStream.write(chunk));
    child.stderr?.on("data", (chunk: Buffer) => logStream.write(chunk));
    const result = await child;
    logStream.end();

    const durationMs = Date.now() - started;
    const timedOut = result.timedOut === true;
    const exitCode = timedOut ? -1 : result.exitCode ?? 0;

    if (timedOut) {
      emit({ type: "timeout", jobId: spec.id, runId, timestamp: new Date().toISOString(), data: { maxRunSeconds: spec.maxRunSeconds, durationMs } });
    }
    emit({
      type: exitCode === 0 ? "agent_end" : "agent_error",
      jobId: spec.id,
      runId,
      timestamp: new Date().toISOString(),
      data: { exitCode, durationMs, timedOut, cmd, args },
    });

    return { runId, exitCode, durationMs, timedOut };
  } catch (err: unknown) {
    logStream.end();
    const msg = err instanceof Error ? err.message : String(err);
    emit({
      type: "agent_error",
      jobId: spec.id,
      runId,
      timestamp: new Date().toISOString(),
      data: { error: msg.slice(0, 500) },
    });
    return { runId, exitCode: 127, durationMs: Date.now() - started, timedOut: false };
  }
}
