import { fileExists, readJson, writeJsonAtomic } from "../utils/files.js";
import { schedulerPaths } from "./paths.js";

export interface JobState {
  /** ISO timestamp of the last successful dispatch start. */
  lastRunAt?: string;
  /** ISO timestamp the loop should next consider firing this job. */
  nextDueAt?: string;
  /** Last exit code observed. -1 = timeout. */
  lastExitCode?: number;
  /** Streak — reset to 0 on success. Used to auto-disable noisy jobs. */
  consecutiveFailures: number;
  /** Set true when consecutiveFailures crosses disableAfterConsecutiveFailures. */
  autoDisabled?: boolean;
  /** ISO timestamp the job became autoDisabled. */
  autoDisabledAt?: string;
}

export interface SchedulerState {
  /** All known jobs keyed by id, regardless of enabled status. */
  jobs: Record<string, JobState>;
  /** ISO timestamp of the last state write. */
  updatedAt: string;
}

const EMPTY: SchedulerState = { jobs: {}, updatedAt: new Date(0).toISOString() };

export async function loadState(): Promise<SchedulerState> {
  if (!fileExists(schedulerPaths.state)) return structuredClone(EMPTY);
  try {
    return (await readJson<SchedulerState>(schedulerPaths.state)) ?? structuredClone(EMPTY);
  } catch {
    // corrupted file — start fresh; the previous state.json will be overwritten on next save
    return structuredClone(EMPTY);
  }
}

export async function saveState(state: SchedulerState): Promise<void> {
  await writeJsonAtomic(schedulerPaths.state, { ...state, updatedAt: new Date().toISOString() });
}

export function ensureJobState(state: SchedulerState, id: string): JobState {
  if (!state.jobs[id]) state.jobs[id] = { consecutiveFailures: 0 };
  return state.jobs[id]!;
}
