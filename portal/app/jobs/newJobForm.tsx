"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createJob, type CreateJobInput } from "./actions";

type ScheduleType = "interval" | "daily" | "weekly" | "cron";
const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;

export function NewJobForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | undefined>();

  const [id, setId] = useState("");
  const [description, setDescription] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [scheduleType, setScheduleType] = useState<ScheduleType>("interval");
  const [intervalMinutes, setIntervalMinutes] = useState(5);
  const [time, setTime] = useState("02:00");
  const [weekday, setWeekday] = useState<(typeof WEEKDAYS)[number]>("Friday");
  const [cron, setCron] = useState("");
  const [argvStr, setArgvStr] = useState("pwagent run triage");

  if (!open) {
    return (
      <div>
        <Button size="sm" onClick={() => setOpen(true)} className="gap-1">
          <Plus className="h-4 w-4" /> New job
        </Button>
      </div>
    );
  }

  const submit = () => {
    setError(undefined);
    const argv = argvStr.trim().split(/\s+/).filter(Boolean);
    const input: CreateJobInput = {
      id: id.trim(),
      description: description.trim() || undefined,
      enabled,
      scheduleType,
      argv,
      intervalMinutes: scheduleType === "interval" ? intervalMinutes : undefined,
      time: scheduleType === "daily" || scheduleType === "weekly" ? time : undefined,
      weekday: scheduleType === "weekly" ? weekday : undefined,
      cron: scheduleType === "cron" ? cron : undefined,
    };
    startTransition(async () => {
      const res = await createJob(input);
      if (!res.ok) {
        setError(res.error ?? "unknown error");
        return;
      }
      setOpen(false);
      setId("");
      setDescription("");
      setEnabled(false);
      setArgvStr("pwagent run triage");
      router.refresh();
    });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
        <div>
          <CardTitle>New scheduled job</CardTitle>
          <CardDescription>
            Appended to <code className="rounded bg-muted px-1.5 py-0.5">~/.pwagent/config.json</code> →{" "}
            <code>schedules[]</code>. Hot-reloaded by the scheduler.
          </CardDescription>
        </div>
        <Button size="icon" variant="ghost" onClick={() => setOpen(false)} aria-label="close">
          <X className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field label="id (lowercase-kebab)">
            <input
              className={inputClass}
              value={id}
              onChange={(e) => setId(e.target.value)}
              placeholder="my-monitor"
            />
          </Field>

          <Field label="description (optional)">
            <input
              className={inputClass}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What this job does"
            />
          </Field>

          <Field label="schedule type">
            <select
              className={inputClass}
              value={scheduleType}
              onChange={(e) => setScheduleType(e.target.value as ScheduleType)}
            >
              <option value="interval">interval (every N minutes)</option>
              <option value="daily">daily (HH:MM)</option>
              <option value="weekly">weekly (weekday + HH:MM)</option>
              <option value="cron">cron (expression)</option>
            </select>
          </Field>

          {scheduleType === "interval" && (
            <Field label="every N minutes">
              <input
                type="number"
                min={1}
                className={inputClass}
                value={intervalMinutes}
                onChange={(e) => setIntervalMinutes(Number(e.target.value))}
              />
            </Field>
          )}

          {(scheduleType === "daily" || scheduleType === "weekly") && (
            <Field label="time (HH:MM, 24h)">
              <input
                className={inputClass}
                value={time}
                onChange={(e) => setTime(e.target.value)}
                placeholder="02:00"
              />
            </Field>
          )}

          {scheduleType === "weekly" && (
            <Field label="weekday">
              <select
                className={inputClass}
                value={weekday}
                onChange={(e) => setWeekday(e.target.value as (typeof WEEKDAYS)[number])}
              >
                {WEEKDAYS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </Field>
          )}

          {scheduleType === "cron" && (
            <Field label="cron expression">
              <input
                className={inputClass}
                value={cron}
                onChange={(e) => setCron(e.target.value)}
                placeholder="*/5 9-17 * * 1-5"
              />
            </Field>
          )}

          <div className="md:col-span-2">
            <Field label="command (space-separated argv)">
              <input
                className={inputClass}
                value={argvStr}
                onChange={(e) => setArgvStr(e.target.value)}
                placeholder="pwagent run triage --once"
              />
            </Field>
          </div>

          <Field label="enabled on create?">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
              <span>enabled</span>
            </label>
          </Field>
        </div>

        {error && (
          <p className="mt-3 rounded-md bg-red-100 px-3 py-2 text-xs text-red-700 dark:bg-red-900/30 dark:text-red-300">
            {error}
          </p>
        )}

        <div className="mt-4 flex items-center gap-2">
          <Button size="sm" onClick={submit} disabled={pending || !id.trim() || !argvStr.trim()}>
            {pending ? "Creating…" : "Create job"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

const inputClass =
  "block w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring";
