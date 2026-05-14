import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const moduleDir = dirname(fileURLToPath(import.meta.url));

export const PWAGENT_HOME = process.env.PWAGENT_HOME ?? join(homedir(), ".pwagent");

export const paths = {
  home: PWAGENT_HOME,
  config: join(PWAGENT_HOME, "config.json"),
  agents: join(PWAGENT_HOME, "agents"),
  skills: join(PWAGENT_HOME, "skills"),
  scheduler: join(PWAGENT_HOME, "scheduler"),
  logs: join(PWAGENT_HOME, "logs"),
  audit: join(PWAGENT_HOME, "audit"),
  reports: join(PWAGENT_HOME, "reports"),
  state: join(PWAGENT_HOME, "state"),
  routing: join(PWAGENT_HOME, "routing.md"),
  ceremonies: join(PWAGENT_HOME, "ceremonies.md"),
  decisions: join(PWAGENT_HOME, "decisions.md"),
} as const;

/**
 * Path to embedded content shipped inside the binary's dist tree.
 * Resolved relative to this module so it works whether running from dist/ or via tsx.
 */
export function embeddedContentDir(): string {
  // moduleDir during build (compiled) is dist/utils, embedded content at dist/content
  // during dev (tsx) is src/utils, embedded content at src/content
  return resolve(moduleDir, "..", "content");
}

/**
 * Resolve the workspace override directory. Returns the first directory that
 * exists, in this priority order:
 *
 *   1. <cwd>/.pwagent/   — preferred (our convention)
 *   2. <cwd>/.squad/     — Squad upstream compatibility (created by `npx squad init`)
 *
 * Returns the .pwagent path even if neither exists, so callers that want to
 * write into the workspace know the canonical target.
 */
export function workspaceDir(cwd: string = process.cwd()): string {
  const preferred = join(cwd, ".pwagent");
  if (existsSync(preferred)) return preferred;
  const squadFallback = join(cwd, ".squad");
  if (existsSync(squadFallback)) return squadFallback;
  return preferred;
}

/**
 * Returns every workspace override directory that actually exists, in priority
 * order. Useful for loaders that want to merge content from both .pwagent and
 * .squad when both happen to be present (later entries win).
 */
export function workspaceDirsInPriority(cwd: string = process.cwd()): string[] {
  const out: string[] = [];
  const pwagent = join(cwd, ".pwagent");
  const squad = join(cwd, ".squad");
  // lowest-priority first, highest-priority last (matches "later override wins" semantics
  // used by the charter loader's Map.set pattern)
  if (existsSync(squad)) out.push(squad);
  if (existsSync(pwagent)) out.push(pwagent);
  return out;
}

/** @deprecated Use workspaceDir() instead. Kept as alias for backward-compat. */
export function workspaceSquadDir(cwd: string = process.cwd()): string {
  return workspaceDir(cwd);
}
