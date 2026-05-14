"use client";

import { useEffect, useRef, useState } from "react";

interface LifecycleEvent {
  type: string;
  jobId: string;
  runId: string;
  timestamp: string;
  data?: Record<string, unknown>;
}

export function EventStream({ jobId }: { jobId: string }) {
  const [events, setEvents] = useState<LifecycleEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const seenRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const url = `/api/events/jobs/${encodeURIComponent(jobId)}`;
    const es = new EventSource(url);

    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.onmessage = (e) => {
      try {
        const parsed = JSON.parse(e.data) as LifecycleEvent;
        const key = `${parsed.runId}:${parsed.timestamp}:${parsed.type}`;
        if (seenRef.current.has(key)) return;
        seenRef.current.add(key);
        setEvents((prev) => [...prev.slice(-199), parsed]);
      } catch {
        /* ignore non-JSON heartbeats */
      }
    };

    return () => {
      es.close();
    };
  }, [jobId]);

  if (events.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
        {connected ? "connected — waiting for events" : "connecting…"}
      </div>
    );
  }

  return (
    <div className="space-y-1 font-mono text-xs">
      <p className="mb-2 text-xs text-muted-foreground">
        {connected ? "● live" : "○ disconnected"} · {events.length} event{events.length === 1 ? "" : "s"}
      </p>
      {events.map((e, i) => (
        <div key={i} className="flex gap-2 border-b border-border/40 py-1 last:border-0">
          <span className="text-muted-foreground">{e.timestamp.split("T")[1]?.slice(0, 8) ?? ""}</span>
          <span className={typeStyle(e.type)}>{e.type}</span>
          <span className="truncate text-muted-foreground">
            {e.data ? JSON.stringify(e.data).slice(0, 140) : ""}
          </span>
        </div>
      ))}
    </div>
  );
}

function typeStyle(type: string): string {
  if (type === "agent_end") return "text-green-600 font-medium";
  if (type === "agent_error" || type === "timeout") return "text-red-600 font-medium";
  if (type === "retry" || type === "skipped") return "text-amber-600";
  if (type === "auto_disabled") return "text-red-700 font-bold";
  return "text-foreground";
}
