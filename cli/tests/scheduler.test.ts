import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTmpHome } from "./helpers/tmpHome.js";
import { mkdir } from "node:fs/promises";

describe("scheduler — spec", () => {
  it("accepts a valid interval spec", async () => {
    const { JobSpecSchema } = await import("../src/scheduler/spec.js");
    const spec = JobSpecSchema.parse({
      id: "test-monitor",
      schedule: { type: "interval", minutes: 5 },
      surface: "self",
      argv: ["run", "monitor"],
    });
    expect(spec.id).toBe("test-monitor");
    expect(spec.maxRunSeconds).toBe(600);
    expect(spec.retry.maxAttempts).toBe(2);
    expect(spec.schedule.catchUp).toBe(true);
  });

  it("rejects interval without minutes", async () => {
    const { JobSpecSchema } = await import("../src/scheduler/spec.js");
    expect(() => JobSpecSchema.parse({ id: "x", schedule: { type: "interval" } })).toThrow();
  });

  it("rejects weekly without weekday", async () => {
    const { JobSpecSchema } = await import("../src/scheduler/spec.js");
    expect(() => JobSpecSchema.parse({ id: "x", schedule: { type: "weekly", time: "09:00" } })).toThrow();
  });

  it("rejects id with uppercase / underscores", async () => {
    const { JobSpecSchema } = await import("../src/scheduler/spec.js");
    expect(() => JobSpecSchema.parse({ id: "BadID", schedule: { type: "interval", minutes: 5 } })).toThrow();
    expect(() => JobSpecSchema.parse({ id: "bad_id", schedule: { type: "interval", minutes: 5 } })).toThrow();
  });
});

describe("scheduler — scheduleCompute", () => {
  it("interval adds minutes * 60_000", async () => {
    const { computeNextDueMs } = await import("../src/scheduler/scheduleCompute.js");
    const from = new Date("2026-05-13T10:00:00Z").getTime();
    const next = computeNextDueMs({ type: "interval", minutes: 5, catchUp: true }, from);
    expect(next).toBe(from + 5 * 60_000);
  });

  it("daily computes next HH:mm at-or-after the reference", async () => {
    const { computeNextDueMs } = await import("../src/scheduler/scheduleCompute.js");
    const from = new Date(2026, 4, 13, 10, 0, 0).getTime(); // local 10:00
    const next = computeNextDueMs({ type: "daily", time: "14:30", catchUp: true }, from);
    const d = new Date(next);
    expect(d.getHours()).toBe(14);
    expect(d.getMinutes()).toBe(30);
    expect(d.getDate()).toBe(13);
  });

  it("daily rolls to tomorrow when target time already passed today", async () => {
    const { computeNextDueMs } = await import("../src/scheduler/scheduleCompute.js");
    const from = new Date(2026, 4, 13, 15, 0, 0).getTime(); // local 15:00
    const next = computeNextDueMs({ type: "daily", time: "09:00", catchUp: true }, from);
    const d = new Date(next);
    expect(d.getDate()).toBe(14);
    expect(d.getHours()).toBe(9);
  });

  it("describeSchedule renders human-readable summary", async () => {
    const { describeSchedule } = await import("../src/scheduler/scheduleCompute.js");
    expect(describeSchedule({ type: "interval", minutes: 5, catchUp: true })).toBe("interval 5m");
    expect(describeSchedule({ type: "daily", time: "02:00", catchUp: true })).toBe("daily 02:00");
    expect(describeSchedule({ type: "weekly", weekday: "Friday", time: "17:00", catchUp: false })).toBe("weekly Friday 17:00");
  });

  it("formatDuration handles ms → human form", async () => {
    const { formatDuration } = await import("../src/scheduler/scheduleCompute.js");
    expect(formatDuration(60_000)).toBe("1m 0s");
    expect(formatDuration(3_600_000)).toBe("1h 0m");
    expect(formatDuration(86_400_000)).toBe("1d 0h");
  });
});

describe("scheduler — state + locks", () => {
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    vi.resetModules();
    const t = await createTmpHome();
    cleanup = t.cleanup;
    const { schedulerPaths } = await import("../src/scheduler/paths.js");
    await mkdir(schedulerPaths.dir, { recursive: true });
    await mkdir(schedulerPaths.locks, { recursive: true });
  });

  afterEach(async () => {
    await cleanup();
  });

  it("loadState returns empty when no file exists", async () => {
    const { loadState } = await import("../src/scheduler/state.js");
    const state = await loadState();
    expect(state.jobs).toEqual({});
  });

  it("saveState then loadState round-trips", async () => {
    const { loadState, saveState, ensureJobState } = await import("../src/scheduler/state.js");
    const state = await loadState();
    const js = ensureJobState(state, "foo");
    js.consecutiveFailures = 3;
    js.nextDueAt = "2026-05-13T12:00:00.000Z";
    await saveState(state);
    const reloaded = await loadState();
    expect(reloaded.jobs["foo"]?.consecutiveFailures).toBe(3);
    expect(reloaded.jobs["foo"]?.nextDueAt).toBe("2026-05-13T12:00:00.000Z");
  });

  it("acquireJobLock prevents double-acquire and releaseJobLock frees it", async () => {
    const { acquireJobLock, releaseJobLock } = await import("../src/scheduler/lock.js");
    const a = await acquireJobLock("foo", 60);
    expect(a).toBe(true);
    const b = await acquireJobLock("foo", 60);
    expect(b).toBe(false);
    releaseJobLock("foo");
    const c = await acquireJobLock("foo", 60);
    expect(c).toBe(true);
    releaseJobLock("foo");
  });

  it("acquireProcessLock returns true for current pid (no-op on second call within same process)", async () => {
    const { acquireProcessLock, releaseProcessLock, readProcessLockPid } = await import("../src/scheduler/lock.js");
    const a = await acquireProcessLock();
    expect(a).toBe(true);
    expect(readProcessLockPid()).toBe(process.pid);
    releaseProcessLock();
    expect(readProcessLockPid()).toBeUndefined();
  });
});

describe("scheduler — event emitter", () => {
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    vi.resetModules();
    const t = await createTmpHome();
    cleanup = t.cleanup;
    const { schedulerPaths } = await import("../src/scheduler/paths.js");
    await mkdir(schedulerPaths.events, { recursive: true });
  });

  afterEach(async () => {
    await cleanup();
  });

  it("emit + readLastEvents round-trips", async () => {
    const { emit, readLastEvents, newRunId } = await import("../src/scheduler/events.js");
    const runId = newRunId();
    emit({ type: "agent_start", jobId: "foo", runId, timestamp: new Date().toISOString() });
    emit({ type: "agent_end", jobId: "foo", runId, timestamp: new Date().toISOString(), data: { exitCode: 0 } });
    const events = readLastEvents("foo", 10);
    expect(events.length).toBe(2);
    expect(events[0]?.type).toBe("agent_start");
    expect(events[1]?.type).toBe("agent_end");
    expect(events[1]?.data?.exitCode).toBe(0);
  });

  it("readLastEvents respects the limit", async () => {
    const { emit, readLastEvents } = await import("../src/scheduler/events.js");
    for (let i = 0; i < 5; i++) {
      emit({ type: "agent_start", jobId: "bar", runId: `r${i}`, timestamp: new Date().toISOString() });
    }
    const events = readLastEvents("bar", 3);
    expect(events.length).toBe(3);
  });
});

describe("scheduler — loadAllJobs", () => {
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    vi.resetModules();
    const t = await createTmpHome();
    cleanup = t.cleanup;
  });

  afterEach(async () => {
    await cleanup();
  });

  it("returns an empty map when no config is present", async () => {
    const { loadAllJobs } = await import("../src/scheduler/jobLoader.js");
    const jobs = await loadAllJobs();
    expect(jobs.size).toBe(0);
  });

  it("loads schedules from config.schedules[]", async () => {
    const { saveConfig } = await import("../src/config/loader.js");
    const { DEFAULT_CONFIG } = await import("../src/config/schema.js");
    const draft = structuredClone(DEFAULT_CONFIG);
    draft.schedules = [
      {
        name: "test-startup",
        kind: "startup",
        command: "pwagent run triage --once",
        enabled: true,
        description: "fires once at boot",
        catchUp: false,
        maxRunSeconds: 600,
      },
      {
        name: "test-daily",
        kind: "daily",
        time: "02:00",
        command: "pwagent run report --period daily",
        enabled: true,
        description: "runs every night",
        catchUp: true,
        maxRunSeconds: 600,
      },
      {
        name: "test-interval",
        kind: "interval",
        interval: 5,
        command: ["gh", "copilot", "ask", "/triage --watch"],
        enabled: false,
        description: "polls every 5 min — disabled by default",
        catchUp: true,
        maxRunSeconds: 600,
      },
    ];
    await saveConfig(draft);

    const { loadAllJobs } = await import("../src/scheduler/jobLoader.js");
    const jobs = await loadAllJobs();
    expect(jobs.size).toBe(3);
    expect(jobs.has("test-startup")).toBe(true);
    expect(jobs.has("test-daily")).toBe(true);
    expect(jobs.has("test-interval")).toBe(true);
    expect(jobs.get("test-interval")?.spec.enabled).toBe(false);
    expect(jobs.get("test-daily")?.spec.schedule.type).toBe("daily");
    expect(jobs.get("test-interval")?.spec.schedule.type).toBe("interval");
    // startup is mapped to a very-long interval internally
    expect(jobs.get("test-startup")?.spec.schedule.type).toBe("interval");
  });

  it("rejects invalid schedules during config save", async () => {
    const { saveConfig } = await import("../src/config/loader.js");
    const { DEFAULT_CONFIG } = await import("../src/config/schema.js");
    const draft = structuredClone(DEFAULT_CONFIG);
    // interval kind without `interval` — should fail the refine check
    (draft.schedules as unknown[]).push({
      name: "bad-interval",
      kind: "interval",
      command: "noop",
    });
    await expect(saveConfig(draft)).rejects.toThrow();
  });

  it("entryToJobSpec wraps a string command via the platform shell", async () => {
    const { entryToJobSpec } = await import("../src/scheduler/jobLoader.js");
    const spec = entryToJobSpec({
      name: "foo",
      kind: "daily",
      time: "09:00",
      command: 'echo "hello"',
      enabled: true,
      description: "",
      catchUp: true,
      maxRunSeconds: 600,
    });
    expect(spec.surface).toBe("external");
    // string command → wrapped in pwsh or sh -c
    expect(spec.argv[0]).toMatch(/pwsh|sh/);
    const joined = spec.argv.join(" ");
    expect(joined).toContain('echo "hello"');
  });

  it("entryToJobSpec passes an argv array verbatim", async () => {
    const { entryToJobSpec } = await import("../src/scheduler/jobLoader.js");
    const spec = entryToJobSpec({
      name: "bar",
      kind: "interval",
      interval: 10,
      command: ["gh", "copilot", "ask", "/triage --watch"],
      enabled: true,
      description: "",
      catchUp: true,
      maxRunSeconds: 600,
    });
    expect(spec.surface).toBe("external");
    expect(spec.argv).toEqual(["gh", "copilot", "ask", "/triage --watch"]);
  });
});
