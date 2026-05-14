import { execa } from "execa";
import { dispatch } from "./dispatcher.js";
import { emit } from "./events.js";
import { acquireJobLock, releaseJobLock } from "./lock.js";
import { computeNextDueMs } from "./scheduleCompute.js";
import { ensureJobState, loadState, saveState, type SchedulerState } from "./state.js";
import { loadAllJobs, watchUserJobs, type LoadedJob } from "./jobLoader.js";
import type { JobSpec } from "./spec.js";

const TICK_MS = 1_000;

interface ActiveJob {
  loaded: LoadedJob;
  inFlight: boolean;
}

export interface LoopHandle {
  stop: () => Promise<void>;
}

/**
 * Start the scheduler tick loop. Runs until `stop()` is called.
 * The loop:
 *   - loads jobs (embedded + user-overrides) on start
 *   - watches the user dir for changes and hot-reloads
 *   - every TICK_MS: scans for due jobs, dispatches them serially per-job
 */
export async function startLoop(): Promise<LoopHandle> {
  const state: SchedulerState = await loadState();
  let jobsMap = await loadAllJobs();
  const active = new Map<string, ActiveJob>();
  for (const [id, j] of jobsMap) active.set(id, { loaded: j, inFlight: false });

  // Initial pass: for each enabled job without a recorded nextDueAt, compute one.
  const now = Date.now();
  for (const a of active.values()) {
    const s = ensureJobState(state, a.loaded.spec.id);
    if (s.nextDueAt === undefined) {
      s.nextDueAt = new Date(computeNextDueMs(a.loaded.spec.schedule, now)).toISOString();
    } else if (a.loaded.spec.schedule.catchUp && new Date(s.nextDueAt).getTime() < now) {
      // The scheduler was offline past the fire time — leave nextDueAt where it is so
      // the next tick fires once immediately (catch-up). Subsequent reschedules happen
      // normally inside the dispatch path.
    }
  }
  await saveState(state);

  const unwatch = await watchUserJobs(async () => {
    jobsMap = await loadAllJobs();
    // merge: keep inFlight flags; drop disappeared; add new
    for (const [id, j] of jobsMap) {
      const existing = active.get(id);
      if (existing) {
        existing.loaded = j;
      } else {
        active.set(id, { loaded: j, inFlight: false });
        const s = ensureJobState(state, id);
        if (s.nextDueAt === undefined) {
          s.nextDueAt = new Date(computeNextDueMs(j.spec.schedule)).toISOString();
        }
      }
    }
    for (const id of [...active.keys()]) {
      if (!jobsMap.has(id)) active.delete(id);
    }
    await saveState(state);
  });

  let stopping = false;
  let tickTimer: NodeJS.Timeout | undefined;

  const tick = async () => {
    if (stopping) return;
    const tNow = Date.now();
    for (const a of active.values()) {
      const spec = a.loaded.spec;
      if (!spec.enabled) continue;
      const st = ensureJobState(state, spec.id);
      if (st.autoDisabled) continue;
      if (a.inFlight) continue;
      if (!st.nextDueAt) continue;
      const due = new Date(st.nextDueAt).getTime();
      if (due > tNow) continue;

      a.inFlight = true;
      // fire and forget — don't block the loop
      void fireWithRetry(spec, state).finally(() => {
        a.inFlight = false;
      });
    }
    if (!stopping) tickTimer = setTimeout(tick, TICK_MS);
  };

  tickTimer = setTimeout(tick, TICK_MS);

  return {
    async stop() {
      stopping = true;
      if (tickTimer) clearTimeout(tickTimer);
      unwatch();
      await saveState(state);
    },
  };
}

async function fireWithRetry(spec: JobSpec, state: SchedulerState): Promise<void> {
  const st = ensureJobState(state, spec.id);

  const gotLock = await acquireJobLock(spec.id, spec.maxRunSeconds);
  if (!gotLock) {
    // Another process/thread is already running this job — silently skip this tick.
    return;
  }

  try {
    await runWithLock(spec, state, st);
  } finally {
    releaseJobLock(spec.id);
  }
}

async function runWithLock(spec: JobSpec, state: SchedulerState, st: ReturnType<typeof ensureJobState>): Promise<void> {
  // optional preDispatch hook — skip if it returns non-zero
  if (spec.hooks?.preDispatch) {
    try {
      const res = await execa(spec.hooks.preDispatch, [], { reject: false, timeout: 30_000 });
      if (res.exitCode !== 0) {
        emit({
          type: "skipped",
          jobId: spec.id,
          runId: `skip_${Date.now()}`,
          timestamp: new Date().toISOString(),
          data: { reason: "preDispatch hook returned non-zero", exitCode: res.exitCode },
        });
        st.nextDueAt = new Date(computeNextDueMs(spec.schedule)).toISOString();
        await saveState(state);
        return;
      }
    } catch {
      // hook failed to run — treat as skip
      st.nextDueAt = new Date(computeNextDueMs(spec.schedule)).toISOString();
      await saveState(state);
      return;
    }
  }

  let attempt = 0;
  let succeeded = false;
  while (attempt < spec.retry.maxAttempts) {
    attempt += 1;
    if (attempt > 1) {
      emit({
        type: "retry",
        jobId: spec.id,
        runId: `retry_${Date.now()}`,
        timestamp: new Date().toISOString(),
        data: { attempt, backoffSeconds: spec.retry.backoffSeconds },
      });
      await new Promise((r) => setTimeout(r, spec.retry.backoffSeconds * 1000));
    }

    st.lastRunAt = new Date().toISOString();
    const result = await dispatch(spec);
    st.lastExitCode = result.exitCode;

    if (result.exitCode === 0) {
      succeeded = true;
      st.consecutiveFailures = 0;
      break;
    }
    if (!spec.retry.onExitCodes.includes(result.exitCode)) break;
  }

  if (succeeded) {
    st.consecutiveFailures = 0;
  } else {
    st.consecutiveFailures += 1;
    if (st.consecutiveFailures >= spec.disableAfterConsecutiveFailures) {
      st.autoDisabled = true;
      st.autoDisabledAt = new Date().toISOString();
      emit({
        type: "auto_disabled",
        jobId: spec.id,
        runId: `auto_${Date.now()}`,
        timestamp: new Date().toISOString(),
        data: { consecutiveFailures: st.consecutiveFailures },
      });
    }
  }

  st.nextDueAt = new Date(computeNextDueMs(spec.schedule)).toISOString();
  await saveState(state);

  if (spec.hooks?.postDispatch) {
    void execa(spec.hooks.postDispatch, [], { reject: false, timeout: 30_000 }).catch(() => {});
  }
}
