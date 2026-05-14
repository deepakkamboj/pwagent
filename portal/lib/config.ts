import { existsSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { portalPaths } from "./paths";

export interface PwagentConfig {
  $schema?: string;
  provider?: {
    clientName?: string;
    model?: string;
    logLevel?: "error" | "warn" | "info" | "debug";
    perAgent?: Record<string, { model?: string }>;
  };
  ado?: { org?: string; project?: string; defaultRepo?: string };
  repos?: Array<{ name: string; path: string; type: "ado" | "github"; defaultBranch: string }>;
  scheduler?: { stateDir?: string; logDir?: string };
  schedules?: Array<Record<string, unknown>>;
  tools?: { allowlist?: string[] };
  audit?: { enabled?: boolean; path?: string };
  defaultSurface?: string;
}

export function readConfig(): PwagentConfig | null {
  if (!existsSync(portalPaths.config)) return null;
  try {
    return JSON.parse(readFileSync(portalPaths.config, "utf8")) as PwagentConfig;
  } catch {
    return null;
  }
}

/** Atomic write — tmp + rename. */
export function writeConfig(cfg: PwagentConfig): void {
  mkdirSync(dirname(portalPaths.config), { recursive: true });
  const tmp = join(dirname(portalPaths.config), `.${Date.now()}.${process.pid}.tmp`);
  writeFileSync(tmp, JSON.stringify(cfg, null, 2) + "\n", { encoding: "utf8" });
  renameSync(tmp, portalPaths.config);
}

/**
 * Compute a per-line diff between two JSON-stringified config snapshots.
 * Returns an array of { type, line, prev?, next? } entries.
 */
export interface DiffLine {
  type: "context" | "added" | "removed" | "changed";
  prev?: string;
  next?: string;
}

export function diffConfigs(prev: PwagentConfig | null, next: PwagentConfig): DiffLine[] {
  const a = (prev ? JSON.stringify(prev, null, 2) : "").split("\n");
  const b = JSON.stringify(next, null, 2).split("\n");
  // Very simple line-diff — fine for human-readable config files (~100 lines).
  // For richer diffs we'd pull in `diff` or `diff-match-patch`, but this stays
  // dep-free.
  const out: DiffLine[] = [];
  const maxLen = Math.max(a.length, b.length);
  for (let i = 0; i < maxLen; i++) {
    const av = a[i];
    const bv = b[i];
    if (av === undefined) {
      out.push({ type: "added", next: bv });
    } else if (bv === undefined) {
      out.push({ type: "removed", prev: av });
    } else if (av === bv) {
      out.push({ type: "context", prev: av, next: bv });
    } else {
      out.push({ type: "changed", prev: av, next: bv });
    }
  }
  return out;
}
