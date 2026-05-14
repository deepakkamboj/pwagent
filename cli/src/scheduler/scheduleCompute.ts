import type { Schedule } from "./spec.js";

/**
 * Compute the next-due timestamp (ms epoch) for a schedule, given a reference time `from`.
 *
 * - interval: from + minutes * 60_000
 * - daily:    next HH:mm in local TZ at-or-after `from`
 * - weekly:   next weekday at HH:mm in local TZ at-or-after `from`
 * - cron:     not implemented in v1 — falls back to interval-of-30m
 */
export function computeNextDueMs(schedule: Schedule, from: number = Date.now()): number {
  if (schedule.cron) return from + 30 * 60_000;
  switch (schedule.type) {
    case "interval":
      return from + (schedule.minutes ?? 1) * 60_000;
    case "daily":
      return nextDailyMs(schedule.time ?? "00:00", from);
    case "weekly":
      return nextWeeklyMs(schedule.weekday ?? "Monday", schedule.time ?? "00:00", from);
    case "cron":
      // unreachable; satisfied above
      return from + 30 * 60_000;
  }
}

function parseHHmm(s: string): { h: number; m: number } {
  const [hh, mm] = s.split(":");
  return { h: Number(hh), m: Number(mm) };
}

function nextDailyMs(time: string, from: number): number {
  const { h, m } = parseHHmm(time);
  const d = new Date(from);
  d.setHours(h, m, 0, 0);
  if (d.getTime() <= from) d.setDate(d.getDate() + 1);
  return d.getTime();
}

const WEEKDAY_IDX: Record<string, number> = {
  Sunday: 0,
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
};

function nextWeeklyMs(weekday: string, time: string, from: number): number {
  const target = WEEKDAY_IDX[weekday];
  if (target === undefined) return nextDailyMs(time, from);
  const { h, m } = parseHHmm(time);
  const d = new Date(from);
  d.setHours(h, m, 0, 0);
  const currentDow = d.getDay();
  let delta = (target - currentDow + 7) % 7;
  if (delta === 0 && d.getTime() <= from) delta = 7;
  d.setDate(d.getDate() + delta);
  return d.getTime();
}

/** Human-readable summary for `pwagent scheduler list`. */
export function describeSchedule(schedule: Schedule): string {
  if (schedule.cron) return `cron ${schedule.cron}`;
  switch (schedule.type) {
    case "interval":
      return `interval ${schedule.minutes}m`;
    case "daily":
      return `daily ${schedule.time}`;
    case "weekly":
      return `weekly ${schedule.weekday} ${schedule.time}`;
    case "cron":
      return "cron";
  }
}

export function formatDuration(ms: number): string {
  if (ms < 0) ms = 0;
  const s = Math.floor(ms / 1000);
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}
