import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { paths } from "../utils/paths.js";
import { loadConfig } from "../config/loader.js";

export type AuditEventType =
  | "run.start"
  | "run.complete"
  | "run.error"
  | "tool.invoke"
  | "tool.error"
  | "review.stamp"
  | "scheduler.start"
  | "scheduler.stop";

export interface AuditEvent {
  type: AuditEventType;
  timestamp: string;
  agent?: string;
  runId?: string;
  data?: Record<string, unknown>;
}

let dirReady = false;

async function ensureAuditDir(path: string): Promise<void> {
  if (dirReady) return;
  await mkdir(dirname(path), { recursive: true });
  dirReady = true;
}

export async function writeAuditEvent(ev: AuditEvent): Promise<void> {
  const cfg = await loadConfig();
  if (!cfg.audit.enabled) return;
  const path = expandHome(cfg.audit.path);
  await ensureAuditDir(path);
  try {
    appendFileSync(path, JSON.stringify({ ...ev, timestamp: ev.timestamp || new Date().toISOString() }) + "\n", "utf8");
  } catch {
    /* best-effort */
  }
}

export function readAuditEvents(sincePath: string, limit = 1000): AuditEvent[] {
  const path = expandHome(sincePath);
  if (!existsSync(path)) return [];
  const out: AuditEvent[] = [];
  try {
    const raw = readFileSync(path, "utf8");
    const lines = raw.split("\n").filter((l) => l.trim()).slice(-limit);
    for (const l of lines) {
      try {
        out.push(JSON.parse(l) as AuditEvent);
      } catch {
        /* skip malformed */
      }
    }
  } catch {
    /* ignore */
  }
  return out;
}

function expandHome(p: string): string {
  if (p.startsWith("~/")) return p.replace(/^~\//, paths.home + "/").replace(/\//g, "/");
  return p;
}
