import { existsSync, readFileSync } from "node:fs";
import { portalPaths } from "./paths";

export interface AuditEvent {
  type: string;
  timestamp: string;
  agent?: string;
  runId?: string;
  data?: Record<string, unknown>;
}

export interface AuditFilter {
  since?: string; // duration like "7d", "24h", "30m"
  type?: string;
  agent?: string;
  search?: string; // free-text match against the serialized event
}

const MAX_EVENTS = 50_000;

export function readAuditEvents(filter: AuditFilter = {}): AuditEvent[] {
  if (!existsSync(portalPaths.audit)) return [];
  let raw: string;
  try {
    raw = readFileSync(portalPaths.audit, "utf8");
  } catch {
    return [];
  }
  const lines = raw.split("\n").filter((l) => l.trim());
  // Read newest-first by reversing once at the boundary, then take the tail.
  const cutoffMs = filter.since ? parseDuration(filter.since) : undefined;
  const cutoff = cutoffMs !== undefined ? Date.now() - cutoffMs : undefined;
  const out: AuditEvent[] = [];

  for (let i = lines.length - 1; i >= 0 && out.length < MAX_EVENTS; i--) {
    let ev: AuditEvent;
    try {
      ev = JSON.parse(lines[i]!) as AuditEvent;
    } catch {
      continue;
    }
    if (cutoff !== undefined) {
      const t = ev.timestamp ? new Date(ev.timestamp).getTime() : 0;
      if (t < cutoff) break; // events are append-only chronological; we're done
    }
    if (filter.type && ev.type !== filter.type) continue;
    if (filter.agent && ev.agent !== filter.agent) continue;
    if (filter.search) {
      const hay = JSON.stringify(ev).toLowerCase();
      if (!hay.includes(filter.search.toLowerCase())) continue;
    }
    out.push(ev);
  }
  return out;
}

export function distinctTypes(events: AuditEvent[]): string[] {
  return Array.from(new Set(events.map((e) => e.type))).sort();
}

export function distinctAgents(events: AuditEvent[]): string[] {
  return Array.from(new Set(events.map((e) => e.agent).filter((a): a is string => !!a))).sort();
}

function parseDuration(s: string): number {
  const m = /^(\d+)([dhm])$/i.exec(s);
  if (!m) return 30 * 86_400_000;
  const n = parseInt(m[1]!, 10);
  const unit = m[2]!.toLowerCase();
  if (unit === "d") return n * 86_400_000;
  if (unit === "h") return n * 3_600_000;
  return n * 60_000;
}
