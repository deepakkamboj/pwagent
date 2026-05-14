import { join } from "node:path";
import { paths as base } from "../utils/paths.js";

export const schedulerPaths = {
  dir: base.scheduler,
  state: join(base.scheduler, "state.json"),
  pid: join(base.scheduler, "pwagent-scheduler.pid"),
  locks: join(base.scheduler, "locks"),
  logs: join(base.logs, "scheduler"),
  events: join(base.scheduler, "events"),
} as const;

export function jobLockPath(id: string): string {
  return join(schedulerPaths.locks, `${id}.lock`);
}

export function jobLogPath(id: string): string {
  return join(schedulerPaths.logs, `${id}.log`);
}

export function jobEventsPath(id: string): string {
  return join(schedulerPaths.events, `${id}.jsonl`);
}
