import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { jobLockPath, schedulerPaths } from "./paths.js";

interface LockData {
  pid: number;
  acquiredAt: string;
  jobId: string;
}

function pidAlive(pid: number): boolean {
  try {
    // signal 0 = liveness probe, throws ESRCH if dead, EPERM if alive but inaccessible.
    process.kill(pid, 0);
    return true;
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (code === "EPERM") return true;
    return false;
  }
}

/** Try to acquire a per-job lock. Returns true if acquired, false if held by a live process. */
export async function acquireJobLock(id: string, maxRunSeconds: number): Promise<boolean> {
  const path = jobLockPath(id);
  await mkdir(dirname(path), { recursive: true });

  if (existsSync(path)) {
    try {
      const data = JSON.parse(readFileSync(path, "utf8")) as LockData;
      const ageSec = (Date.now() - new Date(data.acquiredAt).getTime()) / 1000;
      const stale = !pidAlive(data.pid) || ageSec > maxRunSeconds * 1.5;
      if (!stale) return false;
      // stale — drop and reacquire
      unlinkSync(path);
    } catch {
      // unreadable — treat as stale
      try {
        unlinkSync(path);
      } catch {
        /* race: another process beat us; we'll bail below */
      }
    }
  }

  try {
    writeFileSync(
      path,
      JSON.stringify({ pid: process.pid, acquiredAt: new Date().toISOString(), jobId: id } satisfies LockData),
      { flag: "wx", encoding: "utf8" },
    );
    return true;
  } catch (err: unknown) {
    // wx fails if another process won the race
    const code = (err as { code?: string })?.code;
    if (code === "EEXIST") return false;
    throw err;
  }
}

export function releaseJobLock(id: string): void {
  const path = jobLockPath(id);
  try {
    unlinkSync(path);
  } catch {
    /* already gone */
  }
}

/** Per-process lock — refuses to start a second scheduler on the same machine. */
export async function acquireProcessLock(): Promise<boolean> {
  await mkdir(schedulerPaths.dir, { recursive: true });
  if (existsSync(schedulerPaths.pid)) {
    try {
      const data = JSON.parse(readFileSync(schedulerPaths.pid, "utf8")) as { pid: number };
      if (pidAlive(data.pid) && data.pid !== process.pid) return false;
      unlinkSync(schedulerPaths.pid);
    } catch {
      unlinkSync(schedulerPaths.pid);
    }
  }
  try {
    writeFileSync(
      schedulerPaths.pid,
      JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }),
      { flag: "wx", encoding: "utf8" },
    );
    return true;
  } catch {
    return false;
  }
}

export function releaseProcessLock(): void {
  try {
    unlinkSync(schedulerPaths.pid);
  } catch {
    /* already gone */
  }
}

export function readProcessLockPid(): number | undefined {
  if (!existsSync(schedulerPaths.pid)) return undefined;
  try {
    const data = JSON.parse(readFileSync(schedulerPaths.pid, "utf8")) as { pid: number };
    return data.pid;
  } catch {
    return undefined;
  }
}
