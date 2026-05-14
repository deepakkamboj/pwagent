"use client";

import { useEffect, useRef, useState } from "react";

interface SchedulerEvent {
  ts?: string;
  type?: string;
  job?: string;
  message?: string;
  exitCode?: number;
  durationMs?: number;
  attempt?: number;
  raw?: string;
  [k: string]: unknown;
}

export function SchedulerEventTail() {
  const [events, setEvents] = useState<SchedulerEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const es = new EventSource("/api/events/scheduler");
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.onmessage = (msg) => {
      try {
        const parsed = JSON.parse(msg.data) as SchedulerEvent;
        setEvents((prev) => {
          const next = [...prev, parsed];
          if (next.length > 200) next.splice(0, next.length - 200);
          return next;
        });
      } catch {
        /* ignore non-JSON */
      }
    };
    return () => es.close();
  }, []);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [events]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          {connected ? (
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 animate-pulse rounded-full bg-green-500" />
              connected
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-zinc-400" />
              disconnected
            </span>
          )}
        </span>
        <span>{events.length} event{events.length === 1 ? "" : "s"}</span>
      </div>

      <div
        ref={listRef}
        className="max-h-80 overflow-y-auto rounded-md border border-border bg-muted/30 p-3 font-mono text-xs leading-relaxed"
      >
        {events.length === 0 ? (
          <p className="text-muted-foreground">No events yet. Start the scheduler or fire a job to see events here.</p>
        ) : (
          <ul className="space-y-1">
            {events.map((e, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-muted-foreground">{shortTime(e.ts)}</span>
                <span className="font-semibold">{e.job ?? "—"}</span>
                <span className={typeClass(e.type)}>{e.type ?? "?"}</span>
                <span className="truncate text-muted-foreground">{summary(e)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function shortTime(ts?: string): string {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleTimeString();
  } catch {
    return ts;
  }
}

function typeClass(type?: string): string {
  switch (type) {
    case "agent_start":
    case "scheduler_start":
    case "scheduler.start":
      return "text-blue-600 dark:text-blue-400";
    case "agent_end":
    case "agent.complete":
      return "text-green-600 dark:text-green-400";
    case "agent_error":
    case "agent.error":
    case "scheduler.error":
      return "text-red-600 dark:text-red-400";
    case "agent_disabled":
      return "text-orange-600 dark:text-orange-400";
    default:
      return "text-muted-foreground";
  }
}

function summary(e: SchedulerEvent): string {
  if (e.message) return e.message;
  if (e.raw) return e.raw;
  const parts: string[] = [];
  if (typeof e["exitCode"] === "number") parts.push(`exit=${e["exitCode"]}`);
  if (typeof e["durationMs"] === "number") parts.push(`${Math.round((e["durationMs"] as number) / 100) / 10}s`);
  if (typeof e["attempt"] === "number") parts.push(`attempt=${e["attempt"]}`);
  return parts.join(" · ");
}
