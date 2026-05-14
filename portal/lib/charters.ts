import { readdir, readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import matter from "gray-matter";

export interface CharterSummary {
  name: string;
  description: string;
  source: "embedded" | "workspace" | "user";
  path: string;
}

/**
 * Reads embedded charters from the sibling pwagent CLI's dist/content/agents tree.
 * In production the portal ships next to the CLI; we resolve the path relative to cwd.
 * Falls back to source tree when running in dev mode against an unbuilt CLI.
 */
function candidateCharterRoots(): string[] {
  const cwd = process.cwd();
  return [
    // Monorepo layout: portal/ sibling to cli/
    resolve(cwd, "..", "cli", "dist", "content", "agents"),
    resolve(cwd, "..", "cli", "src", "content", "agents"),
    // Legacy: CLI was at repo root
    resolve(cwd, "..", "dist", "content", "agents"),
    resolve(cwd, "..", "src", "content", "agents"),
  ];
}

async function pickRoot(): Promise<string | undefined> {
  for (const c of candidateCharterRoots()) {
    try {
      const s = await stat(c);
      if (s.isDirectory()) return c;
    } catch {
      // not found, try next
    }
  }
  return undefined;
}

export async function listEmbeddedCharters(): Promise<CharterSummary[]> {
  const root = await pickRoot();
  if (!root) return [];
  const out: CharterSummary[] = [];
  const entries = await readdir(root, { withFileTypes: true });
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const full = join(root, e.name, "charter.md");
    try {
      const raw = await readFile(full, "utf8");
      const parsed = matter(raw);
      const fm = (parsed.data ?? {}) as Record<string, unknown>;
      const fmName = typeof fm["name"] === "string" ? (fm["name"] as string) : e.name;
      const description = typeof fm["description"] === "string" ? (fm["description"] as string) : "";
      out.push({
        name: fmName.replace(/^pwagent-/, ""),
        description,
        source: "embedded",
        path: full,
      });
    } catch {
      // skip
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}
